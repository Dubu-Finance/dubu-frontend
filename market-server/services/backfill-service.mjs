import { randomUUID } from "node:crypto";
import { BASE_INTERVAL, BASE_INTERVAL_MS } from "../config/markets.mjs";
import { fetchBinanceCandles } from "../providers/binance-rest.mjs";
import { upsertCandles } from "../database/market-repository.mjs";
import { withTransaction } from "../database/client.mjs";

export class BackfillService {
  constructor({ pool, repository, markets, restUrl, logger = console }) {
    this.pool = pool;
    this.repository = repository;
    this.markets = markets;
    this.restUrl = restUrl;
    this.logger = logger;
    this.running = false;
  }

  async run({ days = 30, incremental = true } = {}) {
    if (this.running) return { skipped: true, reason: "already-running" };
    this.running = true;

    const currentBucketStart = Math.floor(Date.now() / BASE_INTERVAL_MS) * BASE_INTERVAL_MS;
    const rangeEnd = currentBucketStart - 1;
    const fullRangeStart = currentBucketStart - days * 24 * 60 * 60 * 1000;
    const runId = randomUUID();
    let rowsWritten = 0;

    await this.pool.query(
      `
        INSERT INTO backfill_runs (id, provider, interval, range_start, range_end, status)
        VALUES ($1, 'binance', $2, $3, $4, 'running')
      `,
      [runId, BASE_INTERVAL, fullRangeStart, rangeEnd],
    );

    try {
      for (const market of this.markets) {
        const latestOpenTime = incremental
          ? await this.repository.getLatestOpenTime(market.id)
          : null;
        const rangeStart = latestOpenTime === null
          ? fullRangeStart
          : Math.max(fullRangeStart, latestOpenTime + BASE_INTERVAL_MS);
        if (rangeStart > rangeEnd) continue;

        this.logger.info(`[backfill] ${market.providerSymbol} from ${new Date(rangeStart).toISOString()}`);
        const candles = await fetchBinanceCandles({
          restUrl: this.restUrl,
          providerSymbol: market.providerSymbol,
          rangeStart,
          rangeEnd,
        });
        await withTransaction(this.pool, (client) =>
          upsertCandles(client, market.id, BASE_INTERVAL, candles, "binance"),
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
      this.logger.info(`[backfill] completed with ${rowsWritten.toLocaleString("en-US")} rows`);
      return { skipped: false, rowsWritten };
    } catch (error) {
      await this.pool.query(
        `
          UPDATE backfill_runs
          SET status = 'failed', error_message = $1, completed_at = NOW()
          WHERE id = $2
        `,
        [error instanceof Error ? error.message : String(error), runId],
      ).catch(() => undefined);
      throw error;
    } finally {
      this.running = false;
    }
  }
}
