import pg from "pg";

const { Pool } = pg;

export function createMarketPool(options = {}) {
  const connectionString = options.connectionString ?? process.env.MARKET_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "MARKET_DATABASE_URL is required. Copy .env.example to .env.local and set the PostgreSQL connection URL.",
    );
  }

  return new Pool({
    connectionString,
    max: options.maxConnections ?? 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
}

export async function withTransaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
