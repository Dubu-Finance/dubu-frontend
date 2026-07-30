import type { TokenSymbol } from "@/app/lib/dubu";
import { Interface } from "ethers";

export type LimitOrderStatus =
  | "open"
  | "executing"
  | "filled"
  | "cancelled"
  | "expired"
  | "failed";

export type LimitOrderMessage = {
  maker: `0x${string}`;
  receiver: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  minAmountOut: string;
  validAfter: string;
  expiry: string;
  nonce: string;
  salt: string;
  maxFeeBps: string;
};

export type LimitOrderRecord = {
  id: string;
  orderHash: `0x${string}`;
  chainId: number;
  settlementAddress: `0x${string}`;
  marketId: string;
  side: "buy" | "sell";
  maker: `0x${string}`;
  receiver: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  minAmountOut: string;
  limitPrice: string;
  validAfter: string;
  expiry: string;
  nonce: string;
  salt: string;
  maxFeeBps: number;
  status: LimitOrderStatus;
  executionTxHash: string | null;
  fillTxHash: string | null;
  cancelTxHash: string | null;
  actualAmountIn: string | null;
  actualAmountOut: string | null;
  protocolFee: string | null;
  lastError: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  filledAt: string | null;
  cancelledAt: string | null;
};

export type LimitOrderConfig = {
  enabled: boolean;
  chainId: number;
  settlementAddress: `0x${string}` | null;
  supportedExpiries: string[];
  maxFeeBps: number;
};

export type OrderStreamEvent = {
  type: "order";
  action: "created" | "submitted" | "filled" | "cancelled" | "expired" | "retry";
  data: Partial<LimitOrderRecord> & { orderHash?: string };
};

const ORDER_TYPES = {
  Order: [
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
  ],
};

const CANCEL_TYPES = {
  CancelOrder: [
    { name: "orderHash", type: "bytes32" },
    { name: "maker", type: "address" },
    { name: "deadline", type: "uint64" },
  ],
};

const SETTLEMENT_INTERFACE = new Interface([
  "function cancelOrder((address maker,address receiver,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint64 validAfter,uint64 expiry,uint256 nonce,uint256 salt,uint16 maxFeeBps) order)",
]);

const ORDER_API_URL = (
  process.env.NEXT_PUBLIC_MARKET_DATA_URL ?? "http://localhost:4100"
).replace(/\/+$/, "");

function orderDomain(config: LimitOrderConfig) {
  if (!config.settlementAddress) throw new Error("Limit orders are not enabled.");
  return {
    name: "Dubu Limit Orders",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.settlementAddress,
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ORDER_API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Order API returned ${response.status}`);
  return body;
}

export async function fetchLimitOrderConfig(signal?: AbortSignal) {
  return api<LimitOrderConfig>("/api/orders/config", { signal });
}

export async function createLimitOrder(payload: {
  marketId: string;
  side: "buy" | "sell";
  limitPrice: string;
  order: LimitOrderMessage;
  signature: string;
}) {
  const response = await api<{ order: LimitOrderRecord }>("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.order;
}

export async function fetchLimitOrders(
  maker: string,
  status: "active" | "history" | "all",
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ maker, status, limit: "100" });
  const response = await api<{ orders: LimitOrderRecord[] }>(
    `/api/orders?${query}`,
    { signal },
  );
  return response.orders;
}

export async function cancelLimitOrder(
  order: LimitOrderRecord,
  deadline: string,
  signature: string,
) {
  const response = await api<{ order: LimitOrderRecord }>(
    `/api/orders/${encodeURIComponent(order.orderHash)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ deadline, signature }),
    },
  );
  return response.order;
}

export function limitOrderTypedData(config: LimitOrderConfig, order: LimitOrderMessage) {
  return {
    domain: orderDomain(config),
    primaryType: "Order",
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...ORDER_TYPES,
    },
    message: order,
  };
}

export function cancellationTypedData(
  config: LimitOrderConfig,
  order: LimitOrderRecord,
  deadline: string,
) {
  return {
    domain: orderDomain(config),
    primaryType: "CancelOrder",
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...CANCEL_TYPES,
    },
    message: {
      orderHash: order.orderHash,
      maker: order.maker,
      deadline,
    },
  };
}

export function encodeOnchainCancellation(order: LimitOrderRecord) {
  return SETTLEMENT_INTERFACE.encodeFunctionData("cancelOrder", [{
    maker: order.maker,
    receiver: order.receiver,
    tokenIn: order.tokenIn,
    tokenOut: order.tokenOut,
    amountIn: order.amountIn,
    minAmountOut: order.minAmountOut,
    validAfter: order.validAfter,
    expiry: order.expiry,
    nonce: order.nonce,
    salt: order.salt,
    maxFeeBps: order.maxFeeBps,
  }]) as `0x${string}`;
}

export function randomOrderSalt() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`)
    .toString();
}

function decimalFraction(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const decimals = match[2]?.length ?? 0;
  return {
    numerator: BigInt(`${match[1]}${match[2] ?? ""}`),
    scale: 10n ** BigInt(decimals),
  };
}

export function calculateLimitOutput({
  side,
  amountIn,
  inputDecimals,
  outputDecimals,
  limitPrice,
}: {
  side: "Buy" | "Sell";
  amountIn: bigint;
  inputDecimals: number;
  outputDecimals: number;
  limitPrice: string;
}) {
  const price = decimalFraction(limitPrice);
  if (!price || price.numerator === 0n || amountIn === 0n) return 0n;
  if (side === "Buy") {
    return (
      amountIn *
      10n ** BigInt(outputDecimals) *
      price.scale /
      (price.numerator * 10n ** BigInt(inputDecimals))
    );
  }
  return (
    amountIn *
    price.numerator *
    10n ** BigInt(outputDecimals) /
    (price.scale * 10n ** BigInt(inputDecimals))
  );
}

export function expiryTimestamp(expiry: string) {
  const seconds = expiry === "1 day"
    ? 24 * 60 * 60
    : expiry === "30 days"
      ? 30 * 24 * 60 * 60
      : 7 * 24 * 60 * 60;
  return Math.floor(Date.now() / 1000) + seconds;
}

export function symbolForOrderToken(
  address: string,
  tokens: Array<{ symbol: TokenSymbol; address: string | null }>,
) {
  return tokens.find((token) => token.address?.toLowerCase() === address.toLowerCase())?.symbol;
}

export function subscribeToOrders(
  wallet: string,
  onOrder: (event: OrderStreamEvent) => void,
) {
  let active = true;
  let socket: WebSocket | null = null;
  let timer = 0;
  let attempt = 0;

  const connect = () => {
    if (!active) return;
    const url = new URL(ORDER_API_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.searchParams.set("wallet", wallet);
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      attempt = 0;
    });
    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data)) as OrderStreamEvent;
        if (event.type === "order") onOrder(event);
      } catch {
        // Preserve the most recent valid order list.
      }
    });
    socket.addEventListener("close", () => {
      if (!active) return;
      attempt += 1;
      timer = window.setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempt));
    });
    socket.addEventListener("error", () => socket?.close());
  };

  connect();
  return () => {
    active = false;
    window.clearTimeout(timer);
    socket?.close();
  };
}
