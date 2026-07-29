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
]);

export const MARKET_BY_ID = new Map(MARKETS.map((market) => [market.id, market]));
export const MARKET_BY_PROVIDER_SYMBOL = new Map(
  MARKETS.map((market) => [market.providerSymbol, market]),
);
