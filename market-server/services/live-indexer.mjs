import { BASE_INTERVAL, MARKET_BY_PROVIDER_SYMBOL } from "../config/markets.mjs";
import { BinanceStream } from "../providers/binance-stream.mjs";

const OPEN_CANDLE_PERSIST_INTERVAL = 5000;

export class LiveIndexer {
  constructor({ repository, hub, markets, webSocketUrl, logger = console }) {
    this.repository = repository;
    this.hub = hub;
    this.logger = logger;
    this.status = "idle";
    this.lastPersistedAt = new Map();
    this.stream = new BinanceStream({
      url: webSocketUrl,
      markets,
      onStatus: (status) => {
        this.status = status;
        this.logger.info(`[indexer] Binance stream ${status}`);
      },
      onError: (error) => this.logger.error("[indexer] stream error", error),
      onTicker: (data) => this.handleTicker(data),
      onCandle: (data) => this.handleCandle(data),
    });
  }

  start() {
    this.stream.start();
  }

  stop() {
    this.stream.stop();
    this.status = "stopped";
  }

  handleTicker(data) {
    const market = MARKET_BY_PROVIDER_SYMBOL.get(String(data.s));
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
    this.hub.publish(market.id, { type: "ticker", marketId: market.id, data: ticker });
  }

  handleCandle(data) {
    const market = MARKET_BY_PROVIDER_SYMBOL.get(String(data.s));
    const kline = data.k;
    if (!market || !kline) return;
    const interval = String(kline.i);
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

    this.hub.publish(market.id, {
      type: "candle",
      marketId: market.id,
      interval,
      data: candle,
    });

    if (interval !== BASE_INTERVAL) return;
    const persistenceKey = `${market.id}:${candle.openTime}`;
    const lastPersisted = this.lastPersistedAt.get(persistenceKey) ?? 0;
    if (!kline.x && Date.now() - lastPersisted < OPEN_CANDLE_PERSIST_INTERVAL) return;
    this.lastPersistedAt.set(persistenceKey, Date.now());
    void this.repository.saveCandle(market.id, candle).catch((error) => {
      this.logger.error(`[indexer] failed to persist ${market.id} candle`, error);
    });
  }
}
