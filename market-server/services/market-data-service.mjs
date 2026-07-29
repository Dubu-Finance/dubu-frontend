import { compactCandle, makeTicker } from "../core/candles.mjs";
import { MARKET_BY_ID, SUPPORTED_INTERVALS } from "../config/markets.mjs";

export class MarketDataService {
  constructor(repository) {
    this.repository = repository;
  }

  async getMarkets() {
    return this.repository.listMarkets();
  }

  async getSnapshot(marketId, interval, limit) {
    const market = MARKET_BY_ID.get(marketId);
    const intervalMs = SUPPORTED_INTERVALS[interval];
    if (!market || !intervalMs) return null;

    const [candles, tickerCandles] = await Promise.all([
      this.repository.getCandles(marketId, intervalMs, limit),
      this.repository.getCandles(marketId, SUPPORTED_INTERVALS["5m"], 289),
    ]);

    return {
      market: market.displaySymbol,
      marketId,
      interval,
      source: market.provider,
      providerSymbol: market.providerSymbol,
      generatedAt: Date.now(),
      ticker: makeTicker(tickerCandles),
      candles: candles.map(compactCandle),
    };
  }
}
