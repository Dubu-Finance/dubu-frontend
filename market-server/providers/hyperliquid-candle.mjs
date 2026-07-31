/**
 * Hyperliquid reports one volume per candle, in base units, on both the info endpoint and the
 * WebSocket. The candles table and the ticker both want a quote volume too, so it is derived
 * from the typical price -- the midpoint estimator used for VWAP-style rollups. Over a 5-minute
 * bucket that lands within a fraction of a percent of the true notional, which is close enough
 * for a chart and a "24h volume" figure. The live ticker prefers Hyperliquid's own `dayNtlVlm`
 * where it is available, so this estimate only backs the historical rollup.
 */
function estimateQuoteVolume({ high, low, close, baseVolume }) {
  const typicalPrice = (high + low + close) / 3;
  return Number.isFinite(typicalPrice) ? baseVolume * typicalPrice : 0;
}

/** Normalizes one raw Hyperliquid candle into the shape the repository and hub speak. */
export function normalizeHyperliquidCandle(raw) {
  const candle = {
    openTime: Number(raw?.t),
    closeTime: Number(raw?.T),
    open: Number(raw?.o),
    high: Number(raw?.h),
    low: Number(raw?.l),
    close: Number(raw?.c),
    baseVolume: Number(raw?.v),
    tradeCount: Number(raw?.n) || 0,
  };
  if (!Number.isFinite(candle.openTime) || !Number.isFinite(candle.close)) return null;
  if (!Number.isFinite(candle.baseVolume)) candle.baseVolume = 0;
  candle.quoteVolume = estimateQuoteVolume(candle);
  return candle;
}
