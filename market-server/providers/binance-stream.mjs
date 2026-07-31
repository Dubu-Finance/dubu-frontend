import WebSocket from "ws";
import { SUPPORTED_INTERVALS } from "../config/markets.mjs";

export class BinanceStream {
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
  }

  get provider() {
    return "binance";
  }

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  connect() {
    if (this.closed) return;
    this.onStatus?.(this.reconnectAttempt ? "reconnecting" : "connecting");

    const streams = this.markets.flatMap((market) => {
      const symbol = market.providerSymbol.toLowerCase();
      return [
        `${symbol}@ticker`,
        ...Object.keys(SUPPORTED_INTERVALS).map((interval) => `${symbol}@kline_${interval}`),
      ];
    });
    const target = `${this.url}?streams=${streams.join("/")}`;
    this.socket = new WebSocket(target);

    this.socket.on("open", () => {
      this.reconnectAttempt = 0;
      this.onStatus?.("live");
    });

    this.socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        const data = message?.data;
        if (!data) return;
        if (data.e === "24hrTicker") this.emitTicker(data);
        if (data.e === "kline") this.emitCandle(data);
      } catch (error) {
        this.onError?.(error);
      }
    });

    this.socket.on("error", (error) => {
      this.onError?.(error);
      this.socket?.close();
    });

    this.socket.on("close", () => {
      if (this.closed) return;
      this.reconnectAttempt += 1;
      this.onStatus?.("reconnecting");
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.reconnectAttempt - 1, 5));
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  emitTicker(data) {
    const market = this.marketBySymbol.get(String(data.s));
    if (!market) return;
    const ticker = {
      lastPrice: Number(data.c),
      priceChangePercent24h: Number(data.P),
      high24h: Number(data.h),
      low24h: Number(data.l),
      baseVolume24h: Number(data.v),
      quoteVolume24h: Number(data.q),
      sourceTimestamp: Number(data.E),
    };
    if (!Number.isFinite(ticker.lastPrice)) return;
    this.onTicker?.({ market, ticker });
  }

  emitCandle(data) {
    const market = this.marketBySymbol.get(String(data.s));
    const kline = data.k;
    if (!market || !kline) return;
    const candle = {
      openTime: Number(kline.t),
      closeTime: Number(kline.T),
      open: Number(kline.o),
      high: Number(kline.h),
      low: Number(kline.l),
      close: Number(kline.c),
      baseVolume: Number(kline.v),
      quoteVolume: Number(kline.q),
      tradeCount: Number(kline.n),
    };
    if (!Number.isFinite(candle.openTime) || !Number.isFinite(candle.close)) return;
    this.onCandle?.({
      market,
      interval: String(kline.i),
      candle,
      closed: Boolean(kline.x),
    });
  }
}
