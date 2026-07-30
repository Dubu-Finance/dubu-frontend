import {
  TypedDataEncoder,
  getAddress,
  isAddress,
  verifyTypedData,
} from "ethers";
import { GIWA_CHAIN_ID } from "../config/chain.mjs";

export const ORDER_TYPES = Object.freeze({
  Order: Object.freeze([
    { name: "maker", type: "address" },
    { name: "receiver", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "validAfter", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "salt", type: "uint256" },
    { name: "maxFeeBps", type: "uint16" },
  ]),
});

export const CANCEL_TYPES = Object.freeze({
  CancelOrder: Object.freeze([
    { name: "orderHash", type: "bytes32" },
    { name: "maker", type: "address" },
    { name: "deadline", type: "uint64" },
  ]),
});

export function limitOrderDomain(settlementAddress) {
  return {
    name: "Dubu Limit Orders",
    version: "1",
    chainId: GIWA_CHAIN_ID,
    verifyingContract: getAddress(settlementAddress),
  };
}

function uintString(value, field, bits = 256) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) throw new Error(`${field} must be an unsigned integer.`);
  const parsed = BigInt(text);
  if (parsed >= 2n ** BigInt(bits)) throw new Error(`${field} exceeds uint${bits}.`);
  return parsed.toString();
}

function address(value, field) {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${field} must be a valid address.`);
  }
  return getAddress(value);
}

export function normalizeSignedOrder(value) {
  const order = {
    maker: address(value?.maker, "maker"),
    receiver: address(value?.receiver, "receiver"),
    tokenIn: address(value?.tokenIn, "tokenIn"),
    tokenOut: address(value?.tokenOut, "tokenOut"),
    amountIn: uintString(value?.amountIn, "amountIn"),
    minAmountOut: uintString(value?.minAmountOut, "minAmountOut"),
    validAfter: uintString(value?.validAfter, "validAfter", 64),
    expiry: uintString(value?.expiry, "expiry", 64),
    nonce: uintString(value?.nonce, "nonce"),
    salt: uintString(value?.salt, "salt"),
    maxFeeBps: uintString(value?.maxFeeBps ?? 0, "maxFeeBps", 16),
  };

  if (order.tokenIn === order.tokenOut) throw new Error("tokenIn and tokenOut must differ.");
  if (BigInt(order.amountIn) === 0n) throw new Error("amountIn must be greater than zero.");
  if (BigInt(order.minAmountOut) === 0n) {
    throw new Error("minAmountOut must be greater than zero.");
  }
  if (Number(order.maxFeeBps) > 100) throw new Error("maxFeeBps exceeds 1%.");
  return order;
}

export function hashSignedOrder(order, settlementAddress) {
  return TypedDataEncoder.hash(
    limitOrderDomain(settlementAddress),
    ORDER_TYPES,
    normalizeSignedOrder(order),
  );
}

export function verifySignedOrder(order, signature, settlementAddress) {
  if (typeof signature !== "string" || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    throw new Error("signature must be a 65-byte hex value.");
  }
  const normalized = normalizeSignedOrder(order);
  const signer = verifyTypedData(
    limitOrderDomain(settlementAddress),
    ORDER_TYPES,
    normalized,
    signature,
  );
  if (signer.toLowerCase() !== normalized.maker.toLowerCase()) {
    throw new Error("Order signature does not match maker.");
  }
  return {
    order: normalized,
    orderHash: hashSignedOrder(normalized, settlementAddress),
    signer: getAddress(signer),
  };
}

export function verifyCancellation({
  orderHash,
  maker,
  deadline,
  signature,
  settlementAddress,
}) {
  const message = {
    orderHash: String(orderHash),
    maker: address(maker, "maker"),
    deadline: uintString(deadline, "deadline", 64),
  };
  if (!/^0x[a-fA-F0-9]{64}$/.test(message.orderHash)) {
    throw new Error("orderHash must be 32-byte hex.");
  }
  if (BigInt(message.deadline) < BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error("Cancellation signature expired.");
  }
  const signer = verifyTypedData(
    limitOrderDomain(settlementAddress),
    CANCEL_TYPES,
    message,
    signature,
  );
  if (signer.toLowerCase() !== message.maker.toLowerCase()) {
    throw new Error("Cancellation signature does not match maker.");
  }
  return message;
}
