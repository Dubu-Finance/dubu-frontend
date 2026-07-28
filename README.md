# giwa

DuBu on GIWA Sepolia — an aggregating DEX frontend that routes across a prop AMM,
a UniV2 pool, and an RFQ maker, plus the design and pitch material around it.

## Layout

| Path        | What lives there                                                                |
| ----------- | ------------------------------------------------------------------------------- |
| `frontend/` | The web app: Next.js on [vinext](https://github.com/cloudflare/vinext)/Cloudflare Workers. See [frontend/STARTER.md](frontend/STARTER.md) for the starter's own notes. |
| `assets/`   | Source images and exports used by the app and the deck.                          |
| `pitch/`    | Deck and wireframes.                                                             |

Anything that is not the web app belongs beside `frontend/`, not inside it.

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
