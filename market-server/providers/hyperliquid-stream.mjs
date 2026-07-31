import WebSocket from "ws";
import { SUPPORTED_INTERVALS } from "../config/markets.mjs";
import { normalizeHyperliquidCandle } from "./hyperliquid-candle.mjs";

// Hyperliquid drops a connection that has been silent for 60 seconds. Candle and context
// frames arrive far more often than that on a liquid market, but a halted equity can go quiet,
// so the socket pings on its own rather than relying on the feed to keep itself alive.
const PING_INTERVAL = 30_000;

/**
 * Emits the same normalized events as `BinanceStream` so the indexer stays provider-agnostic.
 *
 * `activeAssetCtx` carries a rolling 24h reference price and both volume figures but no 24h
 * high or low, so those two ticker fields are left null for the indexer to fill from stored
 * candles.
 */
export class HyperliquidStream {
  constructor({ url, markets, onTicker, onCandle, onStatus, onError }) {
    this.url = url;
    this.markets = markets;
    this.marketBySymbol = new Map(markets.map((market) => [market.providerSymbol, market]));
    this.onTicker = onTicker;
    this.onCandle = onCandle;
    this.onStatus = onStatus;
    this.onError = onError;
    this.socket = null;
    this.closed = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  get provider() {
    return "hyperliquid";
  }

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.socket?.close();
  }

  connect() {
    if (this.closed) return;
    this.onStatus?.(this.reconnectAttempt ? "reconnecting" : "connecting");
    this.socket = new WebSocket(this.url);

    this.socket.on("open", () => {
      this.reconnectAttempt = 0;
      for (const market of this.markets) {
        this.subscribe({ type: "activeAssetCtx", coin: market.providerSymbol });
        for (const interval of Object.keys(SUPPORTED_INTERVALS)) {
          this.subscribe({ type: "candle", coin: market.providerSymbol, interval });
        }
      }
      this.pingTimer = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ method: "ping" }));
        }
      }, PING_INTERVAL);
      this.onStatus?.("live");
    });

    this.socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        if (message?.channel === "candle") this.emitCandle(message.data);
        if (message?.channel === "activeAssetCtx") this.emitTicker(message.data);
      } catch (error) {
        this.onError?.(error);
      }
    });

    this.socket.on("error", (error) => {
      this.onError?.(error);
      this.socket?.close();
    });

    this.socket.on("close", () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.closed) return;
      this.reconnectAttempt += 1;
      this.onStatus?.("reconnecting");
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempt - 1, 5));
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  subscribe(subscription) {
    this.socket?.send(JSON.stringify({ method: "subscribe", subscription }));
  }

  emitTicker(data) {
    const market = this.marketBySymbol.get(String(data?.coin));
    const context = data?.ctx;
    if (!market || !context) return;

    // `midPx` is null while the book is one-sided, so fall back to the mark and then the oracle.
    const lastPrice = Number(context.midPx ?? context.markPx ?? context.oraclePx);
    const previousDayPrice = Number(context.prevDayPx);
    if (!Number.isFinite(lastPrice)) return;

    this.onTicker?.({
      market,
      ticker: {
        lastPrice,
        priceChangePercent24h: Number.isFinite(previousDayPrice) && previousDayPrice !== 0
          ? ((lastPrice - previousDayPrice) / previousDayPrice) * 100
          : 0,
        high24h: null,
        low24h: null,
        baseVolume24h: Number(context.dayBaseVlm) || 0,
        quoteVolume24h: Number(context.dayNtlVlm) || 0,
        sourceTimestamp: Date.now(),
      },
    });
  }

  emitCandle(data) {
    const market = this.marketBySymbol.get(String(data?.s));
    const candle = normalizeHyperliquidCandle(data);
    if (!market || !candle) return;
    this.onCandle?.({
      market,
      interval: String(data.i),
      candle,
      closed: Date.now() > candle.closeTime,
    });
  }
}
