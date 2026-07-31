import { normalizeCandle } from "../core/candles.mjs";

const INSERT_BATCH_SIZE = 500;

export async function upsertMarkets(client, markets) {
  for (const market of markets) {
    await client.query(
      `
        INSERT INTO markets (
          id, display_symbol, base_token, quote_token, provider, provider_symbol
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          display_symbol = EXCLUDED.display_symbol,
          base_token = EXCLUDED.base_token,
          quote_token = EXCLUDED.quote_token,
          provider = EXCLUDED.provider,
          provider_symbol = EXCLUDED.provider_symbol,
          updated_at = NOW()
      `,
      [
        market.id,
        market.displaySymbol,
        market.baseToken,
        market.quoteToken,
        market.provider ?? "binance",
        market.providerSymbol,
      ],
    );
  }
}

export async function upsertCandles(client, marketId, interval, candles, source = "binance") {
  for (let offset = 0; offset < candles.length; offset += INSERT_BATCH_SIZE) {
    const batch = candles.slice(offset, offset + INSERT_BATCH_SIZE);
    const values = [];
    const placeholders = batch.map((candle, rowIndex) => {
      const start = rowIndex * 12;
      values.push(
        marketId,
        interval,
        candle.openTime,
        candle.closeTime,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.baseVolume,
        candle.quoteVolume,
        candle.tradeCount,
        source,
      );
      return `(${Array.from({ length: 12 }, (_, index) => `$${start + index + 1}`).join(", ")})`;
    });

    await client.query(
      `
        INSERT INTO candles (
          market_id, interval, open_time, close_time,
          open, high, low, close, base_volume, quote_volume,
          trade_count, source
        )
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (market_id, interval, open_time) DO UPDATE SET
          close_time = EXCLUDED.close_time,
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          base_volume = EXCLUDED.base_volume,
          quote_volume = EXCLUDED.quote_volume,
          trade_count = EXCLUDED.trade_count,
          source = EXCLUDED.source,
          imported_at = NOW()
      `,
      values,
    );
  }
}

export class MarketRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listMarkets() {
    const result = await this.pool.query(`
      SELECT id, display_symbol, base_token, quote_token, provider, provider_symbol
      FROM markets
      ORDER BY display_symbol
    `);
    return result.rows.map((row) => ({
      id: row.id,
      displaySymbol: row.display_symbol,
      baseToken: row.base_token,
      quoteToken: row.quote_token,
      provider: row.provider,
      providerSymbol: row.provider_symbol,
    }));
  }

  /**
   * Newest candle that a REST catch-up wrote, ignoring anything the live stream persisted.
   *
   * The live indexer starts before the startup catch-up and writes the current bucket within a
   * second, so a plain "newest candle" would tell the catch-up it is already up to date and it
   * would fetch nothing. Every history writer labels its rows with the provider name and only
   * the indexer appends `-live`, which is what separates the two here.
   */
  async getLatestBackfilledOpenTime(marketId) {
    const result = await this.pool.query(
      `
        SELECT open_time
        FROM candles
        WHERE market_id = $1 AND interval = '5m' AND source NOT LIKE '%-live'
        ORDER BY open_time DESC
        LIMIT 1
      `,
      [marketId],
    );
    return result.rows[0] ? Number(result.rows[0].open_time) : null;
  }

  /** Highest high and lowest low since `since`, for tickers whose upstream omits them. */
  async getDayRange(marketId, since) {
    const result = await this.pool.query(
      `
        SELECT MAX(high) AS high, MIN(low) AS low
        FROM candles
        WHERE market_id = $1 AND interval = '5m' AND open_time >= $2
      `,
      [marketId, since],
    );
    const row = result.rows[0];
    if (!row || row.high === null || row.low === null) return null;
    return { high: Number(row.high), low: Number(row.low) };
  }

  async getCandles(marketId, intervalMs, limit) {
    const result = await this.pool.query(
      `
        WITH aggregated AS (
          SELECT
            FLOOR(open_time / $2::bigint)::bigint * $2::bigint AS open_time,
            FLOOR(open_time / $2::bigint)::bigint * $2::bigint + $2::bigint - 1 AS close_time,
            (ARRAY_AGG(open ORDER BY open_time ASC))[1] AS open,
            MAX(high) AS high,
            MIN(low) AS low,
            (ARRAY_AGG(close ORDER BY open_time DESC))[1] AS close,
            SUM(base_volume) AS base_volume,
            SUM(quote_volume) AS quote_volume,
            SUM(trade_count)::integer AS trade_count
          FROM candles
          WHERE market_id = $1 AND interval = '5m'
          GROUP BY 1, 2
          ORDER BY 1 DESC
          LIMIT $3
        )
        SELECT *
        FROM aggregated
        ORDER BY open_time ASC
      `,
      [marketId, intervalMs, limit],
    );
    return result.rows.map(normalizeCandle);
  }

  async saveCandle(marketId, candle, source) {
    await upsertCandles(this.pool, marketId, "5m", [candle], source);
  }
}
