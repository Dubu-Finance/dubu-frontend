# DuBu market server

One long-running Node.js process owns the complete market-data path:

```text
Binance REST ── backfill ─┐
                          ├─ PostgreSQL ── REST snapshots ── frontend
Binance WebSocket ─ live ─┤             └─ WebSocket updates ─ frontend
Signed orders ────────────┤
                          └─ matcher ── aggregator ── settlement ── GIWA
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
- `GET /api/orders/config`
- `POST /api/orders`
- `GET /api/orders?maker=0x...&status=active|history|all`
- `GET /api/orders/:orderHash`
- `POST /api/orders/:orderHash/cancel`
- `WS /ws?marketId=:marketId`
- `WS /ws?wallet=:walletAddress`

The frontend base URL is configured with `NEXT_PUBLIC_MARKET_DATA_URL`.

The order API only accepts EIP-712 signatures that recover to the order maker.
Amounts are stored as integer base units in PostgreSQL; display prices are never
used as the settlement guard. The executor compares a fresh aggregator quote to
the signed `minAmountOut` and simulates the complete settlement call before
broadcasting.

Orders are full-fill only. A gasless cancellation removes an open order from the
matcher immediately; the Trade page also lets the maker record that cancellation
onchain when they need final protection against another executor. Fills and
onchain cancellations are reconciled from the settlement contract using the
persisted `chain_checkpoints` cursor.

## Limit-order activation

1. Fund separate GIWA Sepolia deployer and executor accounts with native gas.
2. Set the deployer, executor address, and fee recipient variables from
   `.env.example`, then run `npm run limit:deploy`.
3. Copy the printed settlement address and deployment block into
   `LIMIT_ORDER_SETTLEMENT_ADDRESS` and `LIMIT_ORDER_START_BLOCK`.
4. Store the executor's private key as `LIMIT_ORDER_EXECUTOR_PRIVATE_KEY` in the
   server secret manager. Never expose it through a `NEXT_PUBLIC_` variable.
5. Restart the server. Startup creates the order tables, starts the matcher, and
   resumes contract indexing from its stored checkpoint.

`GET /health` reports `limitOrders: "active"` only when both the settlement
address and executor are configured. RFQ routes remain off by default; set
`LIMIT_ORDER_ALLOW_RFQ=true` only after the RFQ signature lifetime is long enough
for server-side simulation and submission.
