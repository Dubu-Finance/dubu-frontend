# DuBu market server

One long-running Node.js process owns the complete market-data path:

```text
Binance REST ── backfill ─┐
                          ├─ PostgreSQL ── REST snapshots ── frontend
Binance WebSocket ─ live ─┘             └─ WebSocket updates ─ frontend
```

## Structure

```text
market-server/
  config/       markets, intervals, and environment configuration
  core/         provider-independent candle and ticker helpers
  database/     PostgreSQL client and market repository
  providers/    Binance REST and WebSocket adapters
  services/     backfill, live indexing, and market-data queries
  transport/    HTTP API and frontend WebSocket hub
  index.mjs     process composition and graceful shutdown
```

## Run locally

From the repository root, start PostgreSQL and then the market server:

```bash
npm run db:up
npm run market:server
```

The server listens on port `4100` by default. It performs an incremental catch-up
when it starts, maintains the current 5-minute candle in PostgreSQL, and publishes
all supported live intervals to connected frontend clients.

## Endpoints

- `GET /health`
- `GET /api/markets`
- `GET /api/markets/:marketId/snapshot?interval=15m&limit=720`
- `WS /ws?marketId=:marketId`

The frontend base URL is configured with `NEXT_PUBLIC_MARKET_DATA_URL`.
