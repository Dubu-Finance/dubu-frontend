import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMarketPool } from "./lib/postgres.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(SCRIPT_DIR, "../db/market-data.postgres.sql");
const pool = createMarketPool();

try {
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
  console.log("PostgreSQL market-data schema is ready.");
} finally {
  await pool.end();
}
