"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  Toast,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import { MARKETS, type TokenSymbol } from "@/app/lib/dubu";
import {
  fetchMarketSnapshot,
  subscribeToMarket,
  type MarketCandle,
  type MarketTicker,
  type StoredCandle,
} from "@/app/lib/market-data";

type PairKey = `${Exclude<TokenSymbol, "mUSDT">}/mUSDT`;
type OrderMode = "Market" | "Limit";
type OrderTab = "Active" | "History";
type ChartInterval = "5m" | "15m" | "1h" | "4h";
type MarketData = {
  source: string;
  generatedAt: number;
  ticker: MarketTicker;
  candles: MarketCandle[];
};

type StreamStatus = "idle" | "connecting" | "live" | "reconnecting";

const pairs: Record<PairKey, {
  base: Exclude<TokenSymbol, "mUSDT">;
  quote: "mUSDT";
  dataId: string | null;
}> = {
  "mWETH/mUSDT": { base: "mWETH", quote: "mUSDT", dataId: "mweth-musdt" },
  "mWBTC/mUSDT": { base: "mWBTC", quote: "mUSDT", dataId: "mwbtc-musdt" },
  "mBNB/mUSDT": { base: "mBNB", quote: "mUSDT", dataId: "mbnb-musdt" },
  "mXRP/mUSDT": { base: "mXRP", quote: "mUSDT", dataId: "mxrp-musdt" },
  "mSOL/mUSDT": { base: "mSOL", quote: "mUSDT", dataId: "msol-musdt" },
  "mSKHY/mUSDT": { base: "mSKHY", quote: "mUSDT", dataId: null },
  "mAAPL/mUSDT": { base: "mAAPL", quote: "mUSDT", dataId: null },
  "mTSLA/mUSDT": { base: "mTSLA", quote: "mUSDT", dataId: null },
  "mSPCX/mUSDT": { base: "mSPCX", quote: "mUSDT", dataId: null },
};

const pairKeys = MARKETS.map((market) => `${market.base}/${market.quote}` as PairKey);

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : value < 100 ? 4 : 2,
  });
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function decodeCandle(candle: StoredCandle): MarketCandle {
  return {
    openTime: candle[0],
    closeTime: candle[1],
    open: Number(candle[2]),
    high: Number(candle[3]),
    low: Number(candle[4]),
    close: Number(candle[5]),
    baseVolume: Number(candle[6]),
    quoteVolume: Number(candle[7]),
    tradeCount: Number(candle[8]),
  };
}

export default function TradePage() {
  const { connected, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const [pairKey, setPairKey] = useState<PairKey>("mWETH/mUSDT");
  const [pairMenuOpen, setPairMenuOpen] = useState(false);
  const pairMenuRef = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState<ChartInterval>("15m");
  const [mode, setMode] = useState<OrderMode>("Market");
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [expiry, setExpiry] = useState("7 days");
  const [orderTab, setOrderTab] = useState<OrderTab>("Active");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [priceFlash, setPriceFlash] = useState<{
    direction: "up" | "down" | "";
    sequence: number;
  }>({ direction: "", sequence: 0 });
  const lastPriceRef = useRef<Record<string, number>>({});

  const pair = pairs[pairKey];
  const candles = useMemo(() => marketData?.candles.slice(-72) ?? [], [marketData]);
  const currentPrice = marketData?.ticker.lastPrice ?? candles.at(-1)?.close ?? null;
  const marketDataAvailable = currentPrice !== null && candles.length > 0;
  const bounds = useMemo(() => {
    if (!candles.length) return { low: 0, high: 0, range: 1 };
    const low = Math.min(...candles.map((candle) => candle.low));
    const high = Math.max(...candles.map((candle) => candle.high));
    return { low, high, range: high - low || 1 };
  }, [candles]);
  const maxVolume = useMemo(
    () => Math.max(1, ...candles.map((candle) => candle.quoteVolume)),
    [candles],
  );
  const currentPricePosition = currentPrice === null
    ? null
    : Math.min(100, Math.max(0, ((bounds.high - currentPrice) / bounds.range) * 100));
  const timeLabels = useMemo(() => {
    if (!candles.length) return [];
    const indexes = [0, Math.floor(candles.length / 3), Math.floor((candles.length * 2) / 3), candles.length - 1];
    return indexes.map((index) => {
      const timestamp = candles[index]?.openTime ?? 0;
      return new Intl.DateTimeFormat("en-US", {
        month: interval === "4h" ? "short" : undefined,
        day: interval === "4h" ? "numeric" : undefined,
        hour: interval === "4h" ? undefined : "2-digit",
        minute: interval === "4h" ? undefined : "2-digit",
        hour12: false,
      }).format(new Date(timestamp));
    });
  }, [candles, interval]);
  const numericAmount = Number.parseFloat(amount);
  const hasAmount = Number.isFinite(numericAmount) && numericAmount > 0;
  const executionPrice = mode === "Limit"
    ? Number.parseFloat(limitPrice) || currentPrice || 0
    : currentPrice || 0;
  const receiveAmount = hasAmount && executionPrice > 0
    ? side === "Buy"
      ? numericAmount / executionPrice
      : numericAmount * executionPrice
    : 0;

  useEffect(() => {
    if (!pairMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!pairMenuRef.current?.contains(event.target as Node)) setPairMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [pairMenuOpen]);

  useEffect(() => {
    const dataId = pair.dataId;
    if (!dataId) {
      setMarketData(null);
      setMarketLoading(false);
      setMarketError("");
      setStreamStatus("idle");
      return;
    }
    const marketId = dataId;

    let active = true;
    const controller = new AbortController();
    setMarketData(null);
    setMarketError("");
    setMarketLoading(true);

    async function loadMarketData() {
      try {
        const payload = await fetchMarketSnapshot(marketId, interval, controller.signal);
        if (!active || !payload.ticker) return;

        const nextPrice = Number(payload.ticker.lastPrice);
        lastPriceRef.current[pairKey] = nextPrice;
        setMarketData({
          source: payload.source,
          generatedAt: payload.generatedAt,
          ticker: payload.ticker,
          candles: payload.candles.map(decodeCandle),
        });
        setMarketError("");
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setMarketData(null);
        setMarketError(error instanceof Error ? error.message : "Market data unavailable");
      } finally {
        if (active) setMarketLoading(false);
      }
    }

    void loadMarketData();
    return () => {
      active = false;
      controller.abort();
    };
  }, [interval, pair.dataId, pairKey]);

  useEffect(() => {
    const dataId = pair.dataId;
    if (!dataId || !marketDataAvailable) {
      setStreamStatus("idle");
      return;
    }

    function flashPrice(nextPrice: number) {
      const previousPrice = lastPriceRef.current[pairKey];
      if (previousPrice !== undefined && previousPrice !== nextPrice) {
        setPriceFlash((current) => ({
          direction: nextPrice > previousPrice ? "up" : "down",
          sequence: current.sequence + 1,
        }));
      }
      lastPriceRef.current[pairKey] = nextPrice;
    }

    function updateTicker(data: MarketTicker) {
      const nextPrice = Number(data.lastPrice);
      if (!Number.isFinite(nextPrice)) return;
      flashPrice(nextPrice);
      setMarketData((current) => current ? {
        ...current,
        source: "market-server-live",
        ticker: data,
      } : current);
    }

    function updateCandle(nextCandle: MarketCandle) {
      if (!Number.isFinite(nextCandle.openTime) || !Number.isFinite(nextCandle.close)) return;

      setMarketData((current) => {
        if (!current) return current;
        const candleIndex = current.candles.findIndex(
          (candle) => candle.openTime === nextCandle.openTime,
        );
        const candles = [...current.candles];
        if (candleIndex >= 0) {
          candles[candleIndex] = nextCandle;
        } else {
          candles.push(nextCandle);
          candles.sort((a, b) => a.openTime - b.openTime);
        }
        return {
          ...current,
          source: "market-server-live",
          candles: candles.slice(-720),
        };
      });
    }

    return subscribeToMarket({
      marketId: dataId,
      onStatus: setStreamStatus,
      onTicker: updateTicker,
      onCandle: (candleInterval, candle) => {
        if (candleInterval === interval) updateCandle(candle);
      },
    });
  }, [interval, marketDataAvailable, pair.dataId, pairKey]);

  useEffect(() => {
    if (currentPrice === null) return;
    setLimitPrice((value) => value || String(currentPrice));
  }, [currentPrice]);

  function selectPair(next: PairKey) {
    setPairKey(next);
    setLimitPrice("");
    setAmount("");
    setPairMenuOpen(false);
  }

  function handlePrimaryAction() {
    if (!connected) {
      openWallet();
      return;
    }
    if (!onGiwa) {
      void switchToGiwa();
      return;
    }
    if (!hasAmount || !marketDataAvailable) return;
    setReviewOpen(true);
  }

  function submitOrder() {
    setReviewOpen(false);
    setToast(`${mode} order ready. Confirm in your wallet.`);
    window.setTimeout(() => setToast(""), 3200);
  }

  const paySymbol = side === "Buy" ? pair.quote : pair.base;
  const receiveSymbol = side === "Buy" ? pair.base : pair.quote;
  const actionLabel = !connected
    ? "Connect wallet"
    : !onGiwa
      ? "Switch to GIWA"
      : marketLoading
        ? "Loading market data"
      : !marketDataAvailable
        ? "Market data pending"
      : !hasAmount
        ? "Enter an amount"
        : `Review ${mode.toLowerCase()} order`;
  const streamLabel = streamStatus === "live"
    ? "Live"
    : streamStatus === "connecting"
      ? "Connecting"
      : streamStatus === "reconnecting"
        ? "Reconnecting"
        : pair.dataId
          ? "Historical"
          : "Offline";

  return (
    <>
      <div className="advanced-trade-shell">
        <section className="advanced-market-area">
          <Panel className="terminal-chart-panel">
            <div className="terminal-chart-head">
              <div className="terminal-pair-picker" ref={pairMenuRef}>
                <button
                  className="terminal-pair-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={pairMenuOpen}
                  onClick={() => setPairMenuOpen((current) => !current)}
                >
                  <span className="terminal-pair-icons"><TokenIcon symbol={pair.base} /><TokenIcon symbol={pair.quote} /></span>
                  <span><strong>{pairKey}</strong><small>GIWA Sepolia</small></span>
                  <b>⌄</b>
                </button>
                {pairMenuOpen && (
                  <div className="terminal-pair-menu" role="listbox" aria-label="Select market">
                    {pairKeys.map((key) => {
                      const option = pairs[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          role="option"
                          aria-selected={key === pairKey}
                          onClick={() => selectPair(key)}
                        >
                          <span className="terminal-pair-icons"><TokenIcon symbol={option.base} /><TokenIcon symbol={option.quote} /></span>
                          <span><strong>{key}</strong><small>{option.dataId ? "Live market data" : "Data pending"}</small></span>
                          {key === pairKey && <b>✓</b>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className={`terminal-price ${priceFlash.direction ? `price-${priceFlash.direction}` : ""}`}>
                <strong key={`${pairKey}-${priceFlash.sequence}`} aria-live="polite">
                  {currentPrice === null ? "—" : `$${formatPrice(currentPrice)}`}
                </strong>
                {!marketData ? (
                  <span>{marketLoading ? "Loading" : "Data pending"}</span>
                ) : (
                  <span className={marketData.ticker.priceChangePercent24h >= 0 ? "positive" : "negative"}>
                    {marketData.ticker.priceChangePercent24h >= 0 ? "+" : ""}
                    {marketData.ticker.priceChangePercent24h.toFixed(2)}%
                  </span>
                )}
              </div>
              <dl className="terminal-market-stats">
                <div><dt>24h high</dt><dd>{marketData ? `$${formatPrice(marketData.ticker.high24h)}` : "—"}</dd></div>
                <div><dt>24h low</dt><dd>{marketData ? `$${formatPrice(marketData.ticker.low24h)}` : "—"}</dd></div>
                <div><dt>24h volume</dt><dd>{marketData ? formatCompactCurrency(marketData.ticker.quoteVolume24h) : "—"}</dd></div>
              </dl>
            </div>

            <div className="terminal-chart-toolbar">
              <div>
                {(["5m", "15m", "1h", "4h"] as ChartInterval[]).map((value) => (
                  <button key={value} type="button" className={interval === value ? "active" : ""} onClick={() => setInterval(value)}>
                    {value}
                  </button>
                ))}
              </div>
              <span className={`terminal-stream-status ${streamStatus}`}>
                <i aria-hidden="true" />
                {streamLabel}
              </span>
              <button type="button" title="Chart settings" aria-label="Chart settings">⚙</button>
            </div>

            <div className="terminal-chart" aria-label={`${pairKey} candlestick chart`}>
              {marketDataAvailable ? (
                <>
                  <div className="terminal-grid-lines" aria-hidden="true"><i /><i /><i /><i /></div>
                  {currentPricePosition !== null && (
                    <div className="terminal-live-price-layer" aria-hidden="true">
                      <div
                        className={priceFlash.direction ? `price-${priceFlash.direction}` : ""}
                        style={{ top: `${currentPricePosition}%` }}
                      >
                        <i />
                        <span>{formatPrice(currentPrice)}</span>
                      </div>
                    </div>
                  )}
                  <div className="terminal-candles">
                    {candles.map((candle) => {
                      const top = ((bounds.high - candle.high) / bounds.range) * 100;
                      const bottom = ((candle.low - bounds.low) / bounds.range) * 100;
                      const bodyTop = ((bounds.high - Math.max(candle.open, candle.close)) / bounds.range) * 100;
                      const bodyBottom = ((Math.min(candle.open, candle.close) - bounds.low) / bounds.range) * 100;
                      const positive = candle.close >= candle.open;
                      return (
                        <span className={`terminal-candle ${positive ? "up" : "down"}`} key={candle.openTime}>
                          <i className="terminal-wick" style={{ top: `${top}%`, bottom: `${bottom}%` }} />
                          <i className="terminal-body" style={{ top: `${bodyTop}%`, bottom: `${bodyBottom}%` }} />
                          <i className="terminal-volume" style={{ height: `${Math.max(3, (candle.quoteVolume / maxVolume) * 28)}%` }} />
                        </span>
                      );
                    })}
                  </div>
                  <div className="terminal-price-axis" aria-hidden="true">
                    <span>${formatPrice(bounds.high)}</span>
                    <span>${formatPrice(bounds.high - bounds.range / 3)}</span>
                    <span>${formatPrice(bounds.high - (bounds.range * 2) / 3)}</span>
                    <span>${formatPrice(bounds.low)}</span>
                  </div>
                  <div className="terminal-time-axis" aria-hidden="true">
                    {timeLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
                  </div>
                </>
              ) : (
                <div className="terminal-market-empty">
                  <span>⌁</span>
                  <strong>{marketLoading ? "Loading market history" : marketError ? "Market data unavailable" : "Market data pending"}</strong>
                  <p>
                    {marketError
                      ? "The saved market history could not be loaded."
                      : pair.dataId
                        ? "Loading saved Binance candles."
                        : "A market-data provider has not been connected yet."}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          <Panel className="terminal-orders-panel">
            <div className="terminal-orders-head">
              <div role="tablist" aria-label="Orders">
                {(["Active", "History"] as OrderTab[]).map((item) => (
                  <button key={item} type="button" role="tab" aria-selected={orderTab === item} className={orderTab === item ? "active" : ""} onClick={() => setOrderTab(item)}>
                    {item === "Active" ? "Active orders" : "Order history"}
                  </button>
                ))}
              </div>
              <button type="button" aria-label="Refresh orders">↻</button>
            </div>
            <div className="terminal-order-columns" aria-hidden="true">
              <span>Pair / type</span><span>Amount</span><span>Price</span><span>Status</span>
            </div>
            <div className="terminal-orders-empty">
              <span>⌁</span>
              <strong>{orderTab === "Active" ? "No active orders" : "No order history"}</strong>
              <p>{connected ? "Your orders will appear here." : "Connect your wallet to view your orders."}</p>
            </div>
          </Panel>
        </section>

        <Panel className="terminal-order-ticket">
          <div className="terminal-order-mode" role="tablist" aria-label="Order type">
            {(["Market", "Limit"] as OrderMode[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={mode === item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="terminal-side-switch">
            {(["Buy", "Sell"] as const).map((item) => (
              <button key={item} type="button" className={side === item ? `active ${item.toLowerCase()}` : ""} onClick={() => {
                setSide(item);
                setAmount("");
              }}>
                {item} {pair.base}
              </button>
            ))}
          </div>

          <div className="terminal-order-field">
            <div><span>You pay</span><small>Balance —</small></div>
            <label>
              <input value={amount} inputMode="decimal" placeholder="0.00" aria-label="Order amount" onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} />
              <span><TokenIcon symbol={paySymbol} />{paySymbol}</span>
            </label>
            <small>
              {hasAmount && side === "Sell" && currentPrice !== null
                ? `$${formatPrice(numericAmount * currentPrice)}`
                : "Enter an amount"}
            </small>
          </div>

          <div className="terminal-ticket-divider"><span>↓</span></div>

          <div className="terminal-order-field receive">
            <div><span>You receive</span><small>Estimated</small></div>
            <label>
              <strong>{hasAmount ? receiveAmount.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "0.00"}</strong>
              <span><TokenIcon symbol={receiveSymbol} />{receiveSymbol}</span>
            </label>
            <small>Before wallet confirmation</small>
          </div>

          {mode === "Limit" && (
            <div className="terminal-limit-settings">
              <label>
                <span>Limit price</span>
                <div><input value={limitPrice} inputMode="decimal" onChange={(event) => setLimitPrice(event.target.value.replace(/[^0-9.]/g, ""))} /><b>{pair.quote}</b></div>
              </label>
              <label>
                <span>Expiry</span>
                <button type="button" onClick={() => setExpiry((current) => current === "1 day" ? "7 days" : current === "7 days" ? "30 days" : "1 day")}>{expiry}⌄</button>
              </label>
            </div>
          )}

          <dl className="terminal-order-summary">
            <div><dt>Reference price</dt><dd>{currentPrice === null ? "—" : `1 ${pair.base} = ${formatPrice(currentPrice)} ${pair.quote}`}</dd></div>
            <div><dt>Price impact</dt><dd>Calculated at execution</dd></div>
            <div><dt>Network fee</dt><dd>Estimated in wallet</dd></div>
          </dl>

          <button className="app-primary-button terminal-order-action" type="button" disabled={connected && onGiwa && (!hasAmount || !marketDataAvailable)} onClick={handlePrimaryAction}>
            {actionLabel}
          </button>
        </Panel>
      </div>

      {reviewOpen && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal trade-review-modal" role="dialog" aria-modal="true" aria-labelledby="advanced-review-title">
            <button className="app-modal-close" type="button" aria-label="Close order review" onClick={() => setReviewOpen(false)}>×</button>
            <span className="terminal-review-eyebrow">{mode} order</span>
            <h2 id="advanced-review-title">Review order</h2>
            <div className="terminal-review-pair"><TokenIcon symbol={pair.base} /><TokenIcon symbol={pair.quote} /><strong>{pairKey}</strong><span>{side}</span></div>
            <dl className="review-details">
              <div><dt>You pay</dt><dd>{amount} {paySymbol}</dd></div>
              <div><dt>You receive</dt><dd>≈ {receiveAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {receiveSymbol}</dd></div>
              <div><dt>Execution</dt><dd>{mode === "Market" ? "Best available price" : `${formatPrice(executionPrice)} ${pair.quote}`}</dd></div>
              {mode === "Limit" && <div><dt>Expiry</dt><dd>{expiry}</dd></div>}
            </dl>
            <button className="app-primary-button" type="button" onClick={submitOrder}>Confirm in wallet</button>
          </div>
        </div>
      )}

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
