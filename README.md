# giwa

DuBu on GIWA Sepolia — an aggregating DEX frontend that routes across a prop AMM,
a UniV2 pool, and an RFQ maker, plus the design and pitch material around it.

## Layout

| Path             | What lives there                                                                |
| ---------------- | ------------------------------------------------------------------------------- |
| `frontend/`      | The vinext web app. It consumes the market server and contains no indexer code. |
| `market-server/` | One Node.js service for backfill, live indexing, REST, and WebSocket delivery.  |
| `db/`            | PostgreSQL market-data, limit-order, fill, and event schema.                    |
| `contracts/`     | Non-custodial EIP-712 limit-order settlement contract.                         |
| `scripts/`       | Database migration, import, and manual backfill commands.                       |
| `assets/`        | Source images and exports used by the app and the deck.                         |
| `pitch/`         | Deck and wireframes.                                                            |

Anything that is not the web app belongs beside `frontend/`, not inside it.

## Running market data

```bash
npm install
npm run db:up
npm run market:server
```

The market server listens on `http://localhost:4100`. It catches PostgreSQL up
to the latest completed candle, keeps indexing live data, serves chart
snapshots over REST, and publishes price and candle updates over WebSocket.

## Running the frontend

```bash
cd frontend
npm install
npm run dev      # local dev on Cloudflare's dev runtime
npm run build    # verify the vinext build output
npm test         # build, then check the rendered HTML
npm run lint
```

From the repository root, `npm --prefix frontend run dev` does the same thing.

## Chain and contracts

The app talks to real contracts on GIWA Sepolia (chain id `91342`,
RPC `https://sepolia-rpc.giwa.io`). Addresses, the aggregator endpoint, and the
routing notes are in [frontend/app/lib/dubu.ts](frontend/app/lib/dubu.ts). That
module builds requests and reads state only — signing happens in the page through
the user's wallet, so the frontend never holds a key.

Point the app at a local aggregator with `NEXT_PUBLIC_DUBU_AGGREGATOR` in
`frontend/.env.local`.

## Limit orders

Limit orders are signed offchain and settled onchain. The server never receives
a user private key or holds user assets:

1. The wallet approves `DubuLimitOrderSettlement` for the input token.
2. The wallet signs an EIP-712 order containing the exact input and minimum
   output amounts.
3. `market-server` verifies and stores the order in PostgreSQL.
4. The matcher uses indexed market prices to shortlist triggered orders.
5. The executor requests a fresh Dubu Aggregator route, simulates it, and submits
   it to the settlement contract.
6. The settlement contract verifies the signature, pulls the input only during
   execution, enforces the signed minimum output, and pays the receiver.
7. The event indexer reconciles fills and cancellation events after restarts.

Compile and deploy the settlement contract:

```bash
npm run limit:compile
npm run limit:deploy
```

Deployment requires `LIMIT_ORDER_DEPLOYER_PRIVATE_KEY`,
`LIMIT_ORDER_EXECUTOR_ADDRESS`, and a funded GIWA Sepolia account. After
deployment, configure the server with:

```text
LIMIT_ORDER_SETTLEMENT_ADDRESS=0x...
LIMIT_ORDER_EXECUTOR_PRIVATE_KEY=...
LIMIT_ORDER_ALLOW_RFQ=false
LIMIT_ORDER_START_BLOCK=<deployment block printed by the deploy script>
```

The executor key is a hot key used only to pay settlement gas. It must not be a
token owner or a user wallet. RFQ execution is disabled by default because the
current maker signature TTL is shorter than a reliable server execution round
trip.
