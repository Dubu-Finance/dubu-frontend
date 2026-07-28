/**
 * The live DuBu deployment on GIWA Sepolia, and the aggregator that routes across it.
 *
 * Everything here talks to real contracts. There are no mock prices: a quote comes from the
 * aggregator, which reads the prop AMM and the UniV2 pool on chain and asks the RFQ maker for a
 * signed order, and the calldata it returns is what the wallet signs.
 *
 * # This file never holds a key and never sends a transaction
 *
 * It builds requests and reads state. Signing happens in the page, through `window.ethereum`, so
 * the user approves every transaction in their own wallet. That mirrors the aggregator's own
 * posture — it returns `to` and `data` and takes no custody — and it is why a compromised
 * frontend can mis-quote but cannot move funds.
 */

export const GIWA_CHAIN_ID = 91342;
export const GIWA_CHAIN_ID_HEX = "0x164ce";
export const GIWA_RPC = "https://sepolia-rpc.giwa.io";
export const EXPLORER = "https://sepolia-explorer.giwa.io";

/**
 * Where the aggregator lives.
 *
 * Overridable so a local `wrangler dev` can be pointed at without a rebuild — the deployed worker
 * is the default because that is what a visitor should hit.
 */
export const AGGREGATOR =
  process.env.NEXT_PUBLIC_DUBU_AGGREGATOR ?? "https://dubu-aggregator.polyrose.workers.dev";

export type TokenSymbol = "mUSDC" | "mWETH" | "mWBTC";

export type TokenInfo = {
  symbol: TokenSymbol;
  name: string;
  address: `0x${string}`;
  decimals: number;
  /** Reference market used for pricing. */
  tracks: string;
};

/** The deployed token set. See `contracts/DEPLOYMENTS.md`. */
export const TOKENS: Record<TokenSymbol, TokenInfo> = {
  mUSDC: {
    symbol: "mUSDC",
    name: "USD Coin",
    address: "0xd28596C6750D87C53EA146134AfAB53de86C5155",
    decimals: 6,
    tracks: "USD",
  },
  mWETH: {
    symbol: "mWETH",
    name: "Wrapped Ether",
    address: "0x81e46C6379498beBEB5DCcD47ab2DdFaf967d445",
    decimals: 18,
    tracks: "ETHUSDT",
  },
  mWBTC: {
    symbol: "mWBTC",
    name: "Wrapped Bitcoin",
    address: "0x3548991B5EF2D7805EFa95bEa6CeDeAee3869875",
    decimals: 8,
    tracks: "BTCUSDT",
  },
};

export const TOKEN_LIST = Object.values(TOKENS);

/** Only these two pairs exist on chain. Anything else has no market and the aggregator says so. */
export const MARKETS: Array<[TokenSymbol, TokenSymbol]> = [
  ["mWETH", "mUSDC"],
  ["mWBTC", "mUSDC"],
];

export function hasMarket(a: TokenSymbol, b: TokenSymbol): boolean {
  return MARKETS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export const CONTRACTS = {
  router: "0x2B10D0b50ca3A7c0C7CCaBc969615b4Db3fb9471",
  propPool: "0xBbE55E29BbC6d71EcAb1ac011c9Ac5206aB2Fe74",
  pmmSettle: "0x68CFa6E265AffD5D0DB2C49E4bb9DaEC5A920A9E",
} as const;

// ---------------------------------------------------------------------------
// Amount formatting
// ---------------------------------------------------------------------------

/**
 * A decimal string into base units, without going through a float.
 *
 * `parseFloat` then `* 10**decimals` loses precision above 2^53, which for an 18-decimal token is
 * anything past about 9 tokens. The amounts here are what a signature commits to, so they are
 * built from the digits.
 */
export function toBaseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return 0n;
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** Base units back to a readable string, again without a float. */
export function fromBaseUnits(value: bigint, decimals: number, places = 6): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  const frac = (v % unit).toString().padStart(decimals, "0").slice(0, places).replace(/0+$/, "");
  const body = frac ? `${whole.toLocaleString("en-US")}.${frac}` : whole.toLocaleString("en-US");
  return negative ? `-${body}` : body;
}

// ---------------------------------------------------------------------------
// The aggregator
// ---------------------------------------------------------------------------

export type VenueBreakdown = {
  prop: string;
  univ2: string;
  rfq: string | null;
  rfqRejected: string | null;
  rfqMakerReason?: string | null;
  rfqMakerCanDeliver?: string | null;
  split: boolean;
  legs: Array<{ venue: string; weightBps: number; amountIn: string; amountOut: string }>;
};

export type Quote = {
  market: string;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  slippageBps: number;
  deadline: string;
  route: { to: `0x${string}`; data: `0x${string}`; value: string; venues: string[] };
  detail: VenueBreakdown;
  approve: { token: `0x${string}`; spender: `0x${string}`; amountIn: string };
};

export type QuoteError = { error: string; detail?: string };

/**
 * Ask the aggregator what a trade is worth and how to execute it.
 *
 * Returns the error body rather than throwing on a 4xx, because "no venue would fill that size"
 * and "that pair has no market" are answers a user needs to read, not exceptions.
 */
export async function fetchQuote(params: {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  receiver: `0x${string}`;
  slippageBps: number;
  signal?: AbortSignal;
}): Promise<Quote | QuoteError> {
  const res = await fetch(`${AGGREGATOR}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn.toString(),
      receiver: params.receiver,
      slippageBps: params.slippageBps,
    }),
    signal: params.signal,
  });
  return (await res.json()) as Quote | QuoteError;
}

export function isQuoteError(q: Quote | QuoteError): q is QuoteError {
  return "error" in q;
}

// ---------------------------------------------------------------------------
// Direct chain reads, for the things the aggregator does not answer
// ---------------------------------------------------------------------------

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(GIWA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const body = (await res.json()) as { result?: string; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result ?? "0x";
}

const pad32 = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");

/** `balanceOf(owner)`. */
export async function balanceOf(token: `0x${string}`, owner: `0x${string}`): Promise<bigint> {
  const out = await ethCall(token, `0x70a08231${pad32(owner)}`);
  return out === "0x" ? 0n : BigInt(out);
}

/** `allowance(owner, spender)`. */
export async function allowance(
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
): Promise<bigint> {
  const out = await ethCall(token, `0xdd62ed3e${pad32(owner)}${pad32(spender)}`);
  return out === "0x" ? 0n : BigInt(out);
}

/** Calldata for `approve(spender, amount)`. */
export function encodeApprove(spender: `0x${string}`, amount: bigint): `0x${string}` {
  return `0x095ea7b3${pad32(spender)}${pad32("0x" + amount.toString(16))}` as `0x${string}`;
}

/**
 * Live pool state, for the panel that shows why a quote is what it is.
 *
 * `effectiveCapacity` rather than the raw one: it is what the pool will actually fill, after the
 * staleness ramp. A pool whose maker has stopped shows capacity walking to zero here, which is the
 * dead-man switch doing its job and is worth being able to see.
 */
export async function poolStatus(pairId: number): Promise<{
  updatedAt: number;
  ageSecs: number;
  maxStaleSecs: number;
  bidCapacity: bigint;
  askCapacity: bigint;
  decaySecs: number;
} | null> {
  try {
    const snap = await ethCall(CONTRACTS.propPool, `0x082af76c${pad32("0x" + pairId.toString(16))}`);
    const eff = await ethCall(CONTRACTS.propPool, `0x0d9f7664${pad32("0x" + pairId.toString(16))}`);
    if (snap.length < 2 + 64 * 14) return null;
    const word = (i: number) => BigInt("0x" + snap.slice(2 + i * 64, 2 + (i + 1) * 64));
    const effWord = (i: number) =>
      eff.length >= 2 + 64 * 3 ? BigInt("0x" + eff.slice(2 + i * 64, 2 + (i + 1) * 64)) : 0n;
    const updatedAt = Number(word(4));
    return {
      updatedAt,
      ageSecs: Math.max(0, Math.floor(Date.now() / 1000) - updatedAt),
      maxStaleSecs: Number(word(13)),
      bidCapacity: effWord(0),
      askCapacity: effWord(1),
      decaySecs: Number(effWord(2)),
    };
  } catch {
    return null;
  }
}

export const PAIR_IDS: Partial<Record<TokenSymbol, number>> = { mWETH: 1, mWBTC: 2 };
