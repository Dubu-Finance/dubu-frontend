"use client";

import { useMemo, useState } from "react";
import {
  Panel,
  Toast,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";

type PairKey = "ETH/USDC" | "WBTC/USDC" | "ETH/USDT";
type OrderMode = "Market" | "Limit";
type OrderTab = "Active" | "History";

const pairs: Record<PairKey, {
  base: string;
  quote: string;
  price: number;
  change: number;
  high: number;
  low: number;
}> = {
  "ETH/USDC": { base: "ETH", quote: "USDC", price: 2568.7, change: 1.84, high: 2627.4, low: 2491.2 },
  "WBTC/USDC": { base: "WBTC", quote: "USDC", price: 68032, change: -0.72, high: 69280, low: 67108 },
  "ETH/USDT": { base: "ETH", quote: "USDT", price: 2567.2, change: 1.79, high: 2625.8, low: 2489.6 },
};

const pairKeys = Object.keys(pairs) as PairKey[];
const movement = [
  -3, 2, 5, -1, 4, -2, 3, 6, -4, -2, 1, 5, 8, 4, -3, 2, 5, -1, 3, 7,
  -2, -5, 1, 4, 2, -1, 6, 3, -4, 2, 1, -3, 5, 7, -2, 4, -1, -6, 3, 2,
  5, -2, 4, -3, 6, -1, 2, 3,
];

function buildCandles(reference: number, interval: string) {
  const factor = interval === "5m" ? 0.18 : interval === "15m" ? 0.28 : interval === "1h" ? 0.46 : 0.72;
  let current = reference * 0.965;
  return movement.map((move, index) => {
    const open = current;
    const close = open * (1 + (move * factor) / 1000);
    const spread = open * ((2 + (index % 4)) * factor) / 1000;
    const high = Math.max(open, close) + spread;
    const low = Math.min(open, close) - spread * 0.82;
    current = close;
    return { open, close, high, low, volume: 22 + ((index * 19) % 62) };
  });
}

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TradePage() {
  const { connected, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const [pairKey, setPairKey] = useState<PairKey>("ETH/USDC");
  const [interval, setInterval] = useState("15m");
  const [mode, setMode] = useState<OrderMode>("Market");
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState(String(pairs[pairKey].price));
  const [expiry, setExpiry] = useState("7 days");
  const [orderTab, setOrderTab] = useState<OrderTab>("Active");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState("");

  const pair = pairs[pairKey];
  const candles = useMemo(() => buildCandles(pair.price, interval), [interval, pair.price]);
  const bounds = useMemo(() => {
    const low = Math.min(...candles.map((candle) => candle.low));
    const high = Math.max(...candles.map((candle) => candle.high));
    return { low, high, range: high - low || 1 };
  }, [candles]);
  const numericAmount = Number.parseFloat(amount);
  const hasAmount = Number.isFinite(numericAmount) && numericAmount > 0;
  const executionPrice = mode === "Limit"
    ? Number.parseFloat(limitPrice) || pair.price
    : pair.price;
  const receiveAmount = hasAmount
    ? side === "Buy"
      ? numericAmount / executionPrice
      : numericAmount * executionPrice
    : 0;

  function cyclePair() {
    const index = pairKeys.indexOf(pairKey);
    const next = pairKeys[(index + 1) % pairKeys.length];
    setPairKey(next);
    setLimitPrice(String(pairs[next].price));
    setAmount("");
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
    if (!hasAmount) return;
    setReviewOpen(true);
  }

  function submitOrder() {
    setReviewOpen(false);
    setToast(`${mode} order prepared. Confirm the transaction in your wallet.`);
    window.setTimeout(() => setToast(""), 3200);
  }

  const paySymbol = side === "Buy" ? pair.quote : pair.base;
  const receiveSymbol = side === "Buy" ? pair.base : pair.quote;
  const actionLabel = !connected
    ? "Connect wallet"
    : !onGiwa
      ? "Switch to GIWA"
      : !hasAmount
        ? "Enter an amount"
        : `Review ${mode.toLowerCase()} order`;

  return (
    <>
      <div className="advanced-trade-shell">
        <section className="advanced-market-area">
          <Panel className="terminal-chart-panel">
            <div className="terminal-chart-head">
              <button className="terminal-pair-button" type="button" onClick={cyclePair}>
                <span className="terminal-pair-icons"><TokenIcon symbol={pair.base} /><TokenIcon symbol={pair.quote} /></span>
                <span><strong>{pairKey}</strong><small>GIWA Sepolia</small></span>
                <b>⌄</b>
              </button>
              <div className="terminal-price">
                <strong>${formatPrice(pair.price)}</strong>
                <span className={pair.change >= 0 ? "positive" : "negative"}>
                  {pair.change >= 0 ? "+" : ""}{pair.change.toFixed(2)}%
                </span>
              </div>
              <dl className="terminal-market-stats">
                <div><dt>24h high</dt><dd>${formatPrice(pair.high)}</dd></div>
                <div><dt>24h low</dt><dd>${formatPrice(pair.low)}</dd></div>
                <div><dt>24h volume</dt><dd>—</dd></div>
              </dl>
            </div>

            <div className="terminal-chart-toolbar">
              <div>
                {["5m", "15m", "1h", "4h"].map((value) => (
                  <button key={value} type="button" className={interval === value ? "active" : ""} onClick={() => setInterval(value)}>
                    {value}
                  </button>
                ))}
              </div>
              <span><i /> Indicative preview</span>
              <button type="button" title="Chart settings" aria-label="Chart settings">⚙</button>
            </div>

            <div className="terminal-chart" aria-label={`${pairKey} indicative candlestick chart`}>
              <div className="terminal-grid-lines" aria-hidden="true"><i /><i /><i /><i /></div>
              <div className="terminal-candles">
                {candles.map((candle, index) => {
                  const top = ((bounds.high - candle.high) / bounds.range) * 100;
                  const bottom = ((candle.low - bounds.low) / bounds.range) * 100;
                  const bodyTop = ((bounds.high - Math.max(candle.open, candle.close)) / bounds.range) * 100;
                  const bodyBottom = ((Math.min(candle.open, candle.close) - bounds.low) / bounds.range) * 100;
                  const positive = candle.close >= candle.open;
                  return (
                    <span className={`terminal-candle ${positive ? "up" : "down"}`} key={`${index}-${candle.close}`}>
                      <i className="terminal-wick" style={{ top: `${top}%`, bottom: `${bottom}%` }} />
                      <i className="terminal-body" style={{ top: `${bodyTop}%`, bottom: `${bodyBottom}%` }} />
                      <i className="terminal-volume" style={{ height: `${candle.volume}%` }} />
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
              <div className="terminal-time-axis" aria-hidden="true"><span>09:00</span><span>13:00</span><span>17:00</span><span>Now</span></div>
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
              <p>{connected ? "Orders submitted through Dubu will appear here." : "Connect your wallet to view your orders."}</p>
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
            <small>{hasAmount && side === "Sell" ? `$${formatPrice(numericAmount * pair.price)}` : "Enter an amount"}</small>
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
            <div><dt>Reference price</dt><dd>1 {pair.base} = {formatPrice(pair.price)} {pair.quote}</dd></div>
            <div><dt>Price impact</dt><dd>Calculated at execution</dd></div>
            <div><dt>Network fee</dt><dd>Estimated in wallet</dd></div>
          </dl>

          <button className="app-primary-button terminal-order-action" type="button" disabled={connected && onGiwa && !hasAmount} onClick={handlePrimaryAction}>
            {actionLabel}
          </button>
          <p className="terminal-order-note">Quotes and executable routes require the Dubu market data and routing services.</p>
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
