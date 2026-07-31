import { randomUUID } from "node:crypto";
import { BASE_INTERVAL, BASE_INTERVAL_MS, marketsByProvider } from "../config/markets.mjs";
import { fetchBinanceCandles } from "../providers/binance-rest.mjs";
import { fetchHyperliquidCandles } from "../providers/hyperliquid-rest.mjs";
import { upsertCandles } from "../database/market-repository.mjs";
import { withTransaction } from "../database/client.mjs";

// Each upstream takes its own base URL option, so the fetchers are wrapped to a common call
// shape and the range arithmetic below stays provider-independent.
const FETCHERS = {
  binance: (restUrls, options) =>
    fetchBinanceCandles({ restUrl: restUrls.binance, ...options }),
  hyperliquid: (restUrls, options) =>
    fetchHyperliquidCandles({ infoUrl: restUrls.hyperliquid, ...options }),
};

export class BackfillService {
  constructor({ pool, repository, markets, restUrls, logger = console }) {
    this.pool = pool;
    this.repository = repository;
    this.markets = markets;
    this.restUrls = restUrls;
    this.logger = logger;
    this.running = false;
  }

  async run({ days = 30, incremental = true } = {}) {
    if (this.running) return { skipped: true, reason: "already-running" };
    this.running = true;

    const currentBucketStart = Math.floor(Date.now() / BASE_INTERVAL_MS) * BASE_INTERVAL_MS;
    const rangeEnd = currentBucketStart - 1;
    const fullRangeStart = currentBucketStart - days * 24 * 60 * 60 * 1000;
    let rowsWritten = 0;

    // One run row per upstream, and one upstream going down does not starve the other: a
    // Binance outage should still leave the equity charts caught up, and vice versa.
    const failures = [];
    try {
      for (const [provider, providerMarkets] of marketsByProvider(this.markets)) {
        try {
          rowsWritten += await this.runProvider({
            provider,
            markets: providerMarkets,
            fullRangeStart,
            rangeEnd,
            incremental,
          });
        } catch (error) {
          failures.push(`${provider} (${error instanceof Error ? error.message : error})`);
          this.logger.error(`[backfill] ${provider} catch-up failed`, error);
        }
      }
    } finally {
      this.running = false;
    }

    const rows = rowsWritten.toLocaleString("en-US");
    if (failures.length > 0) {
      throw new Error(`Backfill wrote ${rows} rows but failed for ${failures.join(", ")}`);
    }
    this.logger.info(`[backfill] completed with ${rows} rows`);
    return { skipped: false, rowsWritten };
  }

  async runProvider({ provider, markets, fullRangeStart, rangeEnd, incremental }) {
    const fetchCandles = FETCHERS[provider];
    if (!fetchCandles) throw new Error(`No backfill adapter for provider "${provider}".`);

    const runId = randomUUID();
    let rowsWritten = 0;
    await this.pool.query(
      `
        INSERT INTO backfill_runs (id, provider, interval, range_start, range_end, status)
        VALUES ($1, $2, $3, $4, $5, 'running')
      `,
      [runId, provider, BASE_INTERVAL, fullRangeStart, rangeEnd],
    );

    try {
      for (const market of markets) {
        const latestOpenTime = incremental
          ? await this.repository.getLatestBackfilledOpenTime(market.id)
          : null;
        const rangeStart = latestOpenTime === null
          ? fullRangeStart
          : Math.max(fullRangeStart, latestOpenTime + BASE_INTERVAL_MS);
        if (rangeStart > rangeEnd) continue;

        this.logger.info(
          `[backfill] ${market.providerSymbol} from ${new Date(rangeStart).toISOString()}`,
        );
        const candles = await fetchCandles(this.restUrls, {
          providerSymbol: market.providerSymbol,
          rangeStart,
          rangeEnd,
        });
        if (candles.length === 0) continue;
        await withTransaction(this.pool, (client) =>
          upsertCandles(client, market.id, BASE_INTERVAL, candles, provider),
        );
        rowsWritten += candles.length;
      }

      await this.pool.query(
        `
          UPDATE backfill_runs
          SET status = 'completed', rows_written = $1, completed_at = NOW()
          WHERE id = $2
        `,
        [rowsWritten, runId],
      );
      return rowsWritten;
    } catch (error) {
      await this.pool.query(
        `
          UPDATE backfill_runs
          SET status = 'failed', rows_written = $1, error_message = $2, completed_at = NOW()
          WHERE id = $3
        `,
        [rowsWritten, error instanceof Error ? error.message : String(error), runId],
      ).catch(() => undefined);
      throw error;
    }
  }
}
