import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { upsertCandles, upsertMarkets } from "./lib/candle-store.mjs";
import { createMarketPool, withTransaction } from "./lib/postgres.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SQLITE_PATH = resolve(SCRIPT_DIR, "../data/market-data.sqlite");

function readArgument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for --${name}`);
  }
  return value;
}

async function main() {
  const sqlitePath = resolve(readArgument("sqlite", DEFAULT_SQLITE_PATH));
  if (!existsSync(sqlitePath)) {
    throw new Error(`SQLite source does not exist: ${sqlitePath}`);
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const pool = createMarketPool();

  try {
    const markets = sqlite.prepare(`
      SELECT
        id,
        display_symbol AS displaySymbol,
        base_token AS baseToken,
        quote_token AS quoteToken,
        provider,
        provider_symbol AS providerSymbol
      FROM markets
      ORDER BY id
    `).all();

    await withTransaction(pool, (client) => upsertMarkets(client, markets));

    let rowsWritten = 0;
    for (const market of markets) {
      const rows = sqlite.prepare(`
        SELECT
          open_time AS openTime,
          close_time AS closeTime,
          open,
          high,
          low,
          close,
          base_volume AS baseVolume,
          quote_volume AS quoteVolume,
          trade_count AS tradeCount
        FROM candles
        WHERE market_id = ? AND interval = '5m'
        ORDER BY open_time ASC
      `).all(market.id);
      await withTransaction(pool, (client) =>
        upsertCandles(client, market.id, "5m", rows, market.provider),
      );
      rowsWritten += rows.length;
      console.log(`${market.displaySymbol}: ${rows.length.toLocaleString("en-US")} candles`);
    }

    console.log(`Migrated ${rowsWritten.toLocaleString("en-US")} candles from SQLite to PostgreSQL.`);
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
