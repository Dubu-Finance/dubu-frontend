export function normalizeCandle(row) {
  return {
    openTime: Number(row.open_time ?? row.openTime),
    closeTime: Number(row.close_time ?? row.closeTime),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    baseVolume: Number(row.base_volume ?? row.baseVolume),
    quoteVolume: Number(row.quote_volume ?? row.quoteVolume),
    tradeCount: Number(row.trade_count ?? row.tradeCount),
  };
}

export function compactCandle(candle) {
  return [
    candle.openTime,
    candle.closeTime,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.baseVolume,
    candle.quoteVolume,
    candle.tradeCount,
  ];
}

export function makeTicker(candles) {
  if (!candles.length) return null;
  const latest = candles.at(-1);
  const dayStart = latest.openTime - 24 * 60 * 60 * 1000;
  const lastDay = candles.filter((candle) => candle.openTime >= dayStart);
  const open24h = lastDay[0]?.open ?? latest.open;

  return {
    lastPrice: latest.close,
    priceChangePercent24h: open24h === 0 ? 0 : ((latest.close - open24h) / open24h) * 100,
    high24h: Math.max(...lastDay.map((candle) => candle.high)),
    low24h: Math.min(...lastDay.map((candle) => candle.low)),
    baseVolume24h: lastDay.reduce((total, candle) => total + candle.baseVolume, 0),
    quoteVolume24h: lastDay.reduce((total, candle) => total + candle.quoteVolume, 0),
    sourceTimestamp: latest.closeTime,
  };
}
