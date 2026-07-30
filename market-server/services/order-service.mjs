import { isAddress } from "ethers";
import { GIWA_CHAIN_ID, CHAIN_TOKENS } from "../config/chain.mjs";
import { MARKET_BY_ID } from "../config/markets.mjs";
import {
  verifyCancellation,
  verifySignedOrder,
} from "../core/limit-order.mjs";

const MAX_EXPIRY_SECONDS = 31 * 24 * 60 * 60;
const MIN_EXPIRY_SECONDS = 30;

function publicOrder(order) {
  if (!order) return null;
  const { signature: _signature, ...safe } = order;
  return safe;
}

function decimalPrice(value) {
  const text = String(value ?? "");
  const match = text.match(/^(\d+)(?:\.(\d{1,18}))?$/);
  if (
    !match ||
    `${match[1]}${match[2] ?? ""}`.length > 38 ||
    !Number.isFinite(Number(text)) ||
    Number(text) <= 0
  ) {
    throw new Error("limitPrice must be a positive decimal with up to 18 places.");
  }
  return text;
}

function validateCanonicalPrice({
  price,
  side,
  amountIn,
  minAmountOut,
  inputDecimals,
  outputDecimals,
}) {
  const [whole, fraction = ""] = price.split(".");
  const priceNumerator = BigInt(`${whole}${fraction}`);
  const priceScale = 10n ** BigInt(fraction.length);
  const amount = BigInt(amountIn);
  const minimum = BigInt(minAmountOut);
  const canonicalNumerator = side === "buy"
    ? amount * 10n ** BigInt(outputDecimals)
    : minimum * 10n ** BigInt(inputDecimals);
  const canonicalDenominator = side === "buy"
    ? minimum * 10n ** BigInt(inputDecimals)
    : amount * 10n ** BigInt(outputDecimals);
  const left = canonicalNumerator * priceScale;
  const right = priceNumerator * canonicalDenominator;
  const difference = left >= right ? left - right : right - left;
  if (difference * 10_000n > left) {
    throw new Error("limitPrice does not match the signed minimum output.");
  }
}

function expectedMarketTokens(market, side) {
  const base = CHAIN_TOKENS[market.baseToken];
  const quote = CHAIN_TOKENS[market.quoteToken];
  if (!base || !quote) throw new Error("Market token configuration is incomplete.");
  return side === "buy"
    ? { tokenIn: quote.address, tokenOut: base.address }
    : { tokenIn: base.address, tokenOut: quote.address };
}

export class OrderService {
  constructor({ repository, hub, settlementAddress, executorConfigured = false }) {
    this.repository = repository;
    this.hub = hub;
    this.settlementAddress = settlementAddress;
    this.executorConfigured = executorConfigured;
  }

  get enabled() {
    return isAddress(this.settlementAddress) && this.executorConfigured;
  }

  getConfig() {
    return {
      enabled: this.enabled,
      chainId: GIWA_CHAIN_ID,
      settlementAddress: isAddress(this.settlementAddress) ? this.settlementAddress : null,
      supportedExpiries: ["1 day", "7 days", "30 days"],
      maxFeeBps: 100,
    };
  }

  assertEnabled() {
    if (!this.enabled) {
      const error = new Error("Limit orders are not enabled on this deployment.");
      error.statusCode = 503;
      throw error;
    }
  }

  async createOrder(payload) {
    this.assertEnabled();
    const marketId = String(payload?.marketId ?? "");
    const market = MARKET_BY_ID.get(marketId);
    if (!market) throw new Error("Unsupported market.");
    const side = String(payload?.side ?? "").toLowerCase();
    if (side !== "buy" && side !== "sell") throw new Error("side must be buy or sell.");

    const verified = verifySignedOrder(
      payload?.order,
      payload?.signature,
      this.settlementAddress,
    );
    const now = Math.floor(Date.now() / 1000);
    const expiry = Number(verified.order.expiry);
    const validAfter = Number(verified.order.validAfter);
    if (expiry < now + MIN_EXPIRY_SECONDS || expiry > now + MAX_EXPIRY_SECONDS) {
      throw new Error("Order expiry must be between 30 seconds and 31 days.");
    }
    if (validAfter > now + 60 * 60 || validAfter >= expiry) {
      throw new Error("Order validAfter is outside the supported range.");
    }

    const expected = expectedMarketTokens(market, side);
    if (
      verified.order.tokenIn.toLowerCase() !== expected.tokenIn.toLowerCase() ||
      verified.order.tokenOut.toLowerCase() !== expected.tokenOut.toLowerCase()
    ) {
      throw new Error("Order token direction does not match market and side.");
    }
    const price = decimalPrice(payload?.limitPrice);
    const inputToken = side === "buy"
      ? CHAIN_TOKENS[market.quoteToken]
      : CHAIN_TOKENS[market.baseToken];
    const outputToken = side === "buy"
      ? CHAIN_TOKENS[market.baseToken]
      : CHAIN_TOKENS[market.quoteToken];
    validateCanonicalPrice({
      price,
      side,
      amountIn: verified.order.amountIn,
      minAmountOut: verified.order.minAmountOut,
      inputDecimals: inputToken.decimals,
      outputDecimals: outputToken.decimals,
    });

    const order = await this.repository.createOrder({
      ...verified.order,
      orderHash: verified.orderHash,
      chainId: GIWA_CHAIN_ID,
      settlementAddress: this.settlementAddress.toLowerCase(),
      marketId,
      side,
      limitPrice: price,
      signature: payload.signature,
    });
    this.hub.publishOrder(order.maker, {
      type: "order",
      action: "created",
      data: publicOrder(order),
    });
    return publicOrder(order);
  }

  async listOrders({ maker, status, limit }) {
    if (!isAddress(maker)) throw new Error("A valid maker address is required.");
    const orders = await this.repository.listOrders({ maker, status, limit });
    return orders.map(publicOrder);
  }

  async getOrder(identifier) {
    const order = await this.repository.getOrder(identifier);
    return publicOrder(order);
  }

  async cancelOrder(identifier, payload) {
    if (!isAddress(this.settlementAddress)) {
      const error = new Error("Limit-order settlement is not configured.");
      error.statusCode = 503;
      throw error;
    }
    const existing = await this.repository.getOrder(identifier);
    if (!existing) {
      const error = new Error("Order not found.");
      error.statusCode = 404;
      throw error;
    }
    verifyCancellation({
      orderHash: existing.orderHash,
      maker: existing.maker,
      deadline: payload?.deadline,
      signature: payload?.signature,
      settlementAddress: this.settlementAddress,
    });
    const cancelled = await this.repository.cancelOrder({
      orderHash: existing.orderHash,
      maker: existing.maker,
    });
    if (!cancelled) {
      const error = new Error("Only an active order can be cancelled.");
      error.statusCode = 409;
      throw error;
    }
    this.hub.publishOrder(cancelled.maker, {
      type: "order",
      action: "cancelled",
      data: publicOrder(cancelled),
    });
    return publicOrder(cancelled);
  }

  async expireOrders() {
    const expired = await this.repository.expireOrders();
    for (const order of expired) {
      this.hub.publishOrder(order.maker, {
        type: "order",
        action: "expired",
        data: publicOrder(order),
      });
    }
    return expired;
  }
}
