function readBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadRuntimeConfig() {
  const databaseUrl = process.env.MARKET_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("MARKET_DATABASE_URL is required.");
  }

  return {
    databaseUrl,
    host: process.env.MARKET_SERVER_HOST ?? "0.0.0.0",
    port: readNumber(process.env.PORT ?? process.env.MARKET_SERVER_PORT, 4100),
    corsOrigins: (process.env.MARKET_CORS_ORIGINS ?? "http://localhost:3002,http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    backfillOnStart: readBoolean(process.env.MARKET_BACKFILL_ON_START, true),
    backfillDays: readNumber(process.env.MARKET_BACKFILL_DAYS, 30),
    binanceRestUrl: process.env.BINANCE_REST_URL ?? "https://data-api.binance.vision",
    binanceWebSocketUrl:
      process.env.BINANCE_WEBSOCKET_URL ?? "wss://data-stream.binance.vision/stream",
  };
}
