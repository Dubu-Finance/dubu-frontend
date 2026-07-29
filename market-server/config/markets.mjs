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
    id: "mweth-musdt",
    displaySymbol: "mWETH/mUSDT",
    baseToken: "mWETH",
    quoteToken: "mUSDT",
    provider: "binance",
    providerSymbol: "ETHUSDT",
  },
  {
    id: "mwbtc-musdt",
    displaySymbol: "mWBTC/mUSDT",
    baseToken: "mWBTC",
    quoteToken: "mUSDT",
    provider: "binance",
    providerSymbol: "BTCUSDT",
  },
  {
    id: "mbnb-musdt",
    displaySymbol: "mBNB/mUSDT",
    baseToken: "mBNB",
    quoteToken: "mUSDT",
    provider: "binance",
    providerSymbol: "BNBUSDT",
  },
  {
    id: "mxrp-musdt",
    displaySymbol: "mXRP/mUSDT",
    baseToken: "mXRP",
    quoteToken: "mUSDT",
    provider: "binance",
    providerSymbol: "XRPUSDT",
  },
  {
    id: "msol-musdt",
    displaySymbol: "mSOL/mUSDT",
    baseToken: "mSOL",
    quoteToken: "mUSDT",
    provider: "binance",
    providerSymbol: "SOLUSDT",
  },
]);

export const MARKET_BY_ID = new Map(MARKETS.map((market) => [market.id, market]));
export const MARKET_BY_PROVIDER_SYMBOL = new Map(
  MARKETS.map((market) => [market.providerSymbol, market]),
);
