export const BASE_INTERVAL = "5m";
export const BASE_INTERVAL_MS = 5 * 60 * 1000;
export const SUPPORTED_INTERVALS = Object.freeze({
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
});

export const MARKETS = Object.freeze([
  {
    id: "mweth-musdc",
    displaySymbol: "mWETH/mUSDC",
    baseToken: "mWETH",
    quoteToken: "mUSDC",
    provider: "binance",
    providerSymbol: "ETHUSDT",
  },
  {
    id: "mwbtc-musdc",
    displaySymbol: "mWBTC/mUSDC",
    baseToken: "mWBTC",
    quoteToken: "mUSDC",
    provider: "binance",
    providerSymbol: "BTCUSDT",
  },
  {
    id: "mbnb-musdc",
    displaySymbol: "mBNB/mUSDC",
    baseToken: "mBNB",
    quoteToken: "mUSDC",
    provider: "binance",
    providerSymbol: "BNBUSDT",
  },
  {
    id: "mxrp-musdc",
    displaySymbol: "mXRP/mUSDC",
    baseToken: "mXRP",
    quoteToken: "mUSDC",
    provider: "binance",
    providerSymbol: "XRPUSDT",
  },
  {
    id: "msol-musdc",
    displaySymbol: "mSOL/mUSDC",
    baseToken: "mSOL",
    quoteToken: "mUSDC",
    provider: "binance",
    providerSymbol: "SOLUSDT",
  },
  // Binance lists no equities, so the three stock pairs track the `xyz` perp DEX on
  // Hyperliquid instead. Its coin names carry the deploying DEX as a prefix and both the
  // info endpoint and the WebSocket want that full string, so `providerSymbol` keeps it.
  {
    id: "maapl-musdc",
    displaySymbol: "mAAPL/mUSDC",
    baseToken: "mAAPL",
    quoteToken: "mUSDC",
    provider: "hyperliquid",
    providerSymbol: "xyz:AAPL",
  },
  {
    id: "mtsla-musdc",
    displaySymbol: "mTSLA/mUSDC",
    baseToken: "mTSLA",
    quoteToken: "mUSDC",
    provider: "hyperliquid",
    providerSymbol: "xyz:TSLA",
  },
  {
    id: "mskhy-musdc",
    displaySymbol: "mSKHY/mUSDC",
    baseToken: "mSKHY",
    quoteToken: "mUSDC",
    provider: "hyperliquid",
    providerSymbol: "xyz:SKHY",
  },
]);

export const MARKET_BY_ID = new Map(MARKETS.map((market) => [market.id, market]));

/** Groups markets by upstream so each provider adapter only sees the symbols it can serve. */
export function marketsByProvider(markets) {
  const grouped = new Map();
  for (const market of markets) {
    const existing = grouped.get(market.provider);
    if (existing) existing.push(market);
    else grouped.set(market.provider, [market]);
  }
  return grouped;
}
