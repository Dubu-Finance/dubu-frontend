import { MARKETS } from "../market-server/config/markets.mjs";
import { loadRuntimeConfig } from "../market-server/config/runtime.mjs";
import { createMarketPool, withTransaction } from "../market-server/database/client.mjs";
import {
  MarketRepository,
  upsertMarkets,
} from "../market-server/database/market-repository.mjs";
import { BackfillService } from "../market-server/services/backfill-service.mjs";

function readDays() {
  const index = process.argv.indexOf("--days");
  const value = index === -1 ? 30 : Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 366) {
    throw new Error("--days must be an integer between 1 and 366");
  }
  return value;
}

async function main() {
  const config = loadRuntimeConfig();
  const pool = createMarketPool({ connectionString: config.databaseUrl });
  const repository = new MarketRepository(pool);

  try {
    await withTransaction(pool, (client) => upsertMarkets(client, MARKETS));
    const backfill = new BackfillService({
      pool,
      repository,
      markets: MARKETS,
      restUrl: config.binanceRestUrl,
    });
    await backfill.run({ days: readDays(), incremental: false });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
