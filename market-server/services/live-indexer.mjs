import { BASE_INTERVAL, marketsByProvider } from "../config/markets.mjs";
import { BinanceStream } from "../providers/binance-stream.mjs";
import { HyperliquidStream } from "../providers/hyperliquid-stream.mjs";

const OPEN_CANDLE_PERSIST_INTERVAL = 5000;
const DAY_RANGE_TTL = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const STREAMS = {
  binance: BinanceStream,
  hyperliquid: HyperliquidStream,
};

// Least healthy wins when the two feeds disagree, so `/health` never reports "live" while one
// upstream is down.
const STATUS_SEVERITY = ["live", "connecting", "reconnecting", "stopped", "idle"];

export class LiveIndexer {
  constructor({ repository, hub, markets, webSocketUrls, logger = console }) {
    this.repository = repository;
    this.hub = hub;
    this.logger = logger;
    this.statuses = new Map();
    this.lastPersistedAt = new Map();
    this.dayRanges = new Map();

    this.streams = [...marketsByProvider(markets)].map(([provider, providerMarkets]) => {
      const Stream = STREAMS[provider];
      if (!Stream) throw new Error(`No live stream adapter for provider "${provider}".`);
      this.statuses.set(provider, "idle");
      return new Stream({
        url: webSocketUrls[provider],
        markets: providerMarkets,
        onStatus: (status) => {
          this.statuses.set(provider, status);
          this.logger.info(`[indexer] ${provider} stream ${status}`);
        },
        onError: (error) => this.logger.error(`[indexer] ${provider} stream error`, error),
        onTicker: (event) => this.handleTicker(event),
        onCandle: (event) => this.handleCandle(event),
      });
    });
  }

  get status() {
    let worst = null;
    for (const status of this.statuses.values()) {
      if (worst === null || STATUS_SEVERITY.indexOf(status) > STATUS_SEVERITY.indexOf(worst)) {
        worst = status;
      }
    }
    return worst ?? "idle";
  }

  get statusByProvider() {
    return Object.fromEntries(this.statuses);
  }

  start() {
    for (const stream of this.streams) stream.start();
  }

  stop() {
    for (const stream of this.streams) {
      stream.stop();
      this.statuses.set(stream.provider, "stopped");
    }
  }

  /**
   * Reads the stored 24h high and low without blocking the publish path.
   *
   * Hyperliquid's asset context has no 24h extremes, and querying for them inline would let one
   * ticker frame overtake another. So the cached value goes out immediately and a stale entry is
   * refreshed in the background; being up to `DAY_RANGE_TTL` behind is invisible on a figure
   * that spans a whole day.
   */
  dayRange(marketId) {
    const entry = this.dayRanges.get(marketId);
    if (!entry?.pending && (!entry || Date.now() - entry.fetchedAt > DAY_RANGE_TTL)) {
      this.dayRanges.set(marketId, { ...entry, pending: true });
      void this.repository
        .getDayRange(marketId, Date.now() - DAY_MS)
        .then((range) => this.dayRanges.set(marketId, { range, fetchedAt: Date.now() }))
        .catch((error) => {
          // Keeping the failed attempt's timestamp lets the next retry wait out the TTL
          // instead of firing a query for every ticker frame while the database is unhappy.
          this.dayRanges.set(marketId, { range: entry?.range ?? null, fetchedAt: Date.now() });
          this.logger.error(`[indexer] failed to read ${marketId} 24h range`, error);
        });
    }
    return entry?.range ?? null;
  }

  handleTicker({ market, ticker }) {
    if (ticker.high24h !== null && ticker.low24h !== null) {
      this.hub.publish(market.id, { type: "ticker", marketId: market.id, data: ticker });
      return;
    }

    const range = this.dayRange(market.id);
    this.hub.publish(market.id, {
      type: "ticker",
      marketId: market.id,
      data: {
        ...ticker,
        high24h: ticker.high24h ?? range?.high ?? ticker.lastPrice,
        low24h: ticker.low24h ?? range?.low ?? ticker.lastPrice,
      },
    });
  }

  handleCandle({ market, interval, candle, closed }) {
    this.hub.publish(market.id, {
      type: "candle",
      marketId: market.id,
      interval,
      data: candle,
    });

    if (interval !== BASE_INTERVAL) return;
    const lastPersisted = this.lastPersistedAt.get(market.id);
    const sameBucket = lastPersisted?.openTime === candle.openTime;
    if (!closed && sameBucket && Date.now() - lastPersisted.at < OPEN_CANDLE_PERSIST_INTERVAL) {
      return;
    }
    this.lastPersistedAt.set(market.id, { openTime: candle.openTime, at: Date.now() });
    void this.repository
      .saveCandle(market.id, candle, `${market.provider}-live`)
      .catch((error) => {
        this.logger.error(`[indexer] failed to persist ${market.id} candle`, error);
      });
  }
}
