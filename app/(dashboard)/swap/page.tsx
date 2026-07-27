"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Panel,
  SectionTitle,
  Toast,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import Sparkline from "@/app/components/Sparkline";

type TokenSymbol = "ETH" | "USDC" | "USDT" | "DAI" | "WBTC";
type TradeMode = "Swap" | "Limit" | "TWAP";

const tokens: Record<TokenSymbol, { name: string; price: number; balance: string }> = {
  ETH: { name: "Ether", price: 2568.7, balance: "—" },
  USDC: { name: "USD Coin", price: 1, balance: "—" },
  USDT: { name: "Tether", price: 0.9994, balance: "—" },
  DAI: { name: "Dai", price: 1.0002, balance: "—" },
  WBTC: { name: "Wrapped Bitcoin", price: 68032, balance: "—" },
};

const marketData = [
  45, 49, 41, 36, 43, 39, 44, 41, 47, 53, 65, 58, 61, 56, 62, 57, 68, 65,
  54, 49, 41, 39, 52, 58, 67, 71, 66, 56, 54, 48, 47, 43, 44, 51, 59, 55,
];

function formatTokenAmount(value: number, symbol: TokenSymbol) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: symbol === "ETH" || symbol === "WBTC" ? 4 : 2,
    maximumFractionDigits: symbol === "ETH" || symbol === "WBTC" ? 6 : 2,
  });
}

export default function SwapPage() {
  const { connected, ethBalance, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const [mode, setMode] = useState<TradeMode>("Swap");
  const [fromToken, setFromToken] = useState<TokenSymbol>("ETH");
  const [toToken, setToToken] = useState<TokenSymbol>("USDC");
  const [amount, setAmount] = useState("");
  const [quoteReady, setQuoteReady] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pickerSide, setPickerSide] = useState<"from" | "to" | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvedTokens, setApprovedTokens] = useState<TokenSymbol[]>([]);
  const [toast, setToast] = useState("");
  const [period, setPeriod] = useState("1D");
  const [limitPrice, setLimitPrice] = useState("2,600.00");
  const [twapParts, setTwapParts] = useState("4");

  const numericAmount = Number.parseFloat(amount);
  const hasAmount = Number.isFinite(numericAmount) && numericAmount > 0;

  useEffect(() => {
    setQuoteReady(false);
    if (!hasAmount) return;
    const timer = window.setTimeout(() => setQuoteReady(true), 520);
    return () => window.clearTimeout(timer);
  }, [amount, fromToken, toToken, mode, hasAmount]);

  useEffect(() => {
    setLimitPrice(
      (tokens[fromToken].price / tokens[toToken].price).toLocaleString("en-US", {
        maximumFractionDigits: toToken === "ETH" || toToken === "WBTC" ? 6 : 2,
      }),
    );
  }, [fromToken, toToken]);

  const quote = useMemo(() => {
    if (!hasAmount) return null;
    const usdValue = numericAmount * tokens[fromToken].price;
    const impact = usdValue < 1_000 ? 0.03 : usdValue < 10_000 ? 0.08 : usdValue < 50_000 ? 0.18 : 0.42;
    const protocolFee = mode === "Limit" ? 0 : 0.0005;
    const output = (usdValue / tokens[toToken].price) * (1 - impact / 100 - protocolFee);
    const slippage = mode === "TWAP" ? 0.3 : 0.5;
    const minimum = output * (1 - slippage / 100);
    return {
      usdValue,
      output,
      impact,
      minimum,
      slippage,
      execution: "Dubu routing",
      networkCost: usdValue > 25_000 ? 11.42 : 6.18,
      rate: tokens[fromToken].price / tokens[toToken].price,
    };
  }, [fromToken, hasAmount, mode, numericAmount, toToken]);

  const displayBalance = connected && fromToken === "ETH" && ethBalance
    ? ethBalance
    : tokens[fromToken].balance;

  function selectToken(symbol: TokenSymbol) {
    if (pickerSide === "from") {
      if (symbol === toToken) setToToken(fromToken);
      setFromToken(symbol);
    } else {
      if (symbol === fromToken) setFromToken(toToken);
      setToToken(symbol);
    }
    setPickerSide(null);
  }

  function reversePair() {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("");
    setDetailsOpen(false);
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
    if (fromToken !== "ETH" && !approvedTokens.includes(fromToken)) {
      setApprovalOpen(true);
      return;
    }
    setReviewOpen(true);
  }

  function approveToken() {
    setApprovedTokens((current) => [...current, fromToken]);
    setApprovalOpen(false);
    setToast(`${fromToken} approved. You can now review the trade.`);
    window.setTimeout(() => setToast(""), 2800);
  }

  function submitTrade() {
    setReviewOpen(false);
    setToast(`${mode} submitted to your wallet for confirmation.`);
    window.setTimeout(() => setToast(""), 3000);
  }

  const actionLabel = !hasAmount
    ? "Enter an amount"
    : !quoteReady
      ? "Fetching quote…"
      : !connected
        ? "Connect wallet"
        : !onGiwa
          ? "Switch to GIWA"
        : fromToken !== "ETH" && !approvedTokens.includes(fromToken)
          ? `Approve ${fromToken}`
          : mode === "Swap"
            ? "Review swap"
            : mode === "Limit"
              ? "Review limit order"
              : "Review TWAP";

  return (
    <div className="trade-page">
      <div className="trade-stage">
        <div className="trade-heading">
          <div>
            <h1>Trade</h1>
            <span>GIWA Sepolia</span>
          </div>
        </div>

        <Panel className="dex-swap-card">
          <div className="trade-mode-tabs" role="tablist" aria-label="Trade type">
            {(["Swap", "Limit", "TWAP"] as TradeMode[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                className={mode === item ? "active" : ""}
                onClick={() => {
                  setMode(item);
                  setDetailsOpen(false);
                }}
              >
                {item}
              </button>
            ))}
            <button className="trade-settings-button" type="button" aria-label="Open trade settings" onClick={() => setDetailsOpen((current) => !current)}>⚙</button>
          </div>

          <div className="dex-token-field">
            <div className="dex-field-label">
              <span>You pay</span>
              <span>Balance: {displayBalance}{displayBalance !== "—" ? ` ${fromToken}` : ""}</span>
            </div>
            <div className="dex-field-main">
              <input
                value={amount}
                inputMode="decimal"
                aria-label="You pay"
                placeholder="0"
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
              />
              <button className="dex-token-button" type="button" onClick={() => setPickerSide("from")}>
                <TokenIcon symbol={fromToken} />
                <strong>{fromToken}</strong>
                <span>⌄</span>
              </button>
            </div>
            <div className="dex-field-fiat">
              <span>{hasAmount ? `$${quote?.usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "$0.00"}</span>
              {connected && fromToken === "ETH" && ethBalance && (
                <button type="button" onClick={() => setAmount(ethBalance)}>Max</button>
              )}
            </div>
          </div>

          <button className="dex-reverse" type="button" onClick={reversePair} aria-label="Reverse token pair">↓</button>

          <div className="dex-token-field output">
            <div className="dex-field-label">
              <span>You receive</span>
              <span>Balance: —</span>
            </div>
            <div className="dex-field-main">
              <div className={quoteReady ? "dex-quote-value" : "dex-quote-value muted"}>
                {!hasAmount ? "0" : !quoteReady ? <span className="quote-loader" /> : formatTokenAmount(quote?.output ?? 0, toToken)}
              </div>
              <button className="dex-token-button" type="button" onClick={() => setPickerSide("to")}>
                <TokenIcon symbol={toToken} />
                <strong>{toToken}</strong>
                <span>⌄</span>
              </button>
            </div>
            <div className="dex-field-fiat">
              <span>{quoteReady && quote ? `$${(quote.output * tokens[toToken].price).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "$0.00"}</span>
            </div>
          </div>

          {mode === "Limit" && (
            <div className="order-options">
              <label><span>Limit price</span><div><input value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} /><b>{toToken} per {fromToken}</b></div></label>
              <label><span>Expiry</span><button type="button">7 days⌄</button></label>
            </div>
          )}

          {mode === "TWAP" && (
            <div className="order-options">
              <label><span>Split into</span><div><input value={twapParts} onChange={(event) => setTwapParts(event.target.value.replace(/\D/g, ""))} /><b>orders</b></div></label>
              <label><span>Frequency</span><button type="button">Every 30 min⌄</button></label>
            </div>
          )}

          {quoteReady && quote && (
            <div className="quote-summary">
              <button type="button" onClick={() => setDetailsOpen((current) => !current)} aria-expanded={detailsOpen}>
                <span>1 {fromToken} = {formatTokenAmount(quote.rate, toToken)} {toToken}</span>
                <span>Network cost ${quote.networkCost.toFixed(2)} <b>{detailsOpen ? "⌃" : "⌄"}</b></span>
              </button>
              {detailsOpen && (
                <dl className="quote-details">
                  <div><dt>Price impact</dt><dd className={quote.impact >= 0.4 ? "warning" : ""}>{quote.impact.toFixed(2)}%</dd></div>
                  <div><dt>Minimum received</dt><dd>{formatTokenAmount(quote.minimum, toToken)} {toToken}</dd></div>
                  <div><dt>Max slippage</dt><dd>{quote.slippage.toFixed(1)}%</dd></div>
                  <div><dt>Execution</dt><dd>{quote.execution} <span className="route-info-dot">ⓘ</span></dd></div>
                </dl>
              )}
            </div>
          )}

          <button
            className="app-primary-button dex-action-button"
            type="button"
            disabled={!hasAmount || !quoteReady}
            onClick={handlePrimaryAction}
          >
            {actionLabel}
          </button>
        </Panel>

        <p className="trade-disclaimer">Rates refresh automatically. Final execution may change before confirmation.</p>
      </div>

      <aside className="trade-side">
        <Panel className="pair-market-panel">
          <SectionTitle
            action={
              <div className="segmented-control">
                {["1D", "1W", "1M"].map((item) => (
                  <button key={item} type="button" className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>
                ))}
              </div>
            }
          >
            {fromToken} / {toToken}
          </SectionTitle>
          <div className="pair-price">
            <strong>{formatTokenAmount(tokens[fromToken].price / tokens[toToken].price, toToken)}</strong>
            <span>+0.97%</span>
          </div>
          <Sparkline data={marketData} height={150} label={`${period} ${fromToken} ${toToken} market chart`} />
          <dl className="pair-market-stats">
            <div><dt>24h high</dt><dd>2,602.34</dd></div>
            <div><dt>24h low</dt><dd>2,475.21</dd></div>
            <div><dt>24h volume</dt><dd>$1.24B</dd></div>
          </dl>
        </Panel>

        <Panel className="activity-empty-panel">
          <SectionTitle>Recent transactions</SectionTitle>
          <div className="dex-empty-state">
            <span>↗</span>
            <strong>No recent transactions</strong>
            <p>{connected ? "Your swaps will appear here after they are submitted." : "Connect your wallet to view your transaction history."}</p>
            {!connected && <button type="button" onClick={openWallet}>Connect wallet</button>}
          </div>
        </Panel>
      </aside>

      {pickerSide && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal token-picker-modal" role="dialog" aria-modal="true" aria-labelledby="token-picker-title">
            <button className="app-modal-close" type="button" aria-label="Close token selector" onClick={() => setPickerSide(null)}>×</button>
            <h2 id="token-picker-title">Select a token</h2>
            <label className="token-search-field"><span>⌕</span><input autoFocus placeholder="Search name or paste address" aria-label="Search tokens" /></label>
            <div className="popular-token-row">
              {(["ETH", "USDC", "USDT"] as TokenSymbol[]).map((symbol) => (
                <button key={symbol} type="button" onClick={() => selectToken(symbol)}><TokenIcon symbol={symbol} />{symbol}</button>
              ))}
            </div>
            <div className="token-list">
              {(Object.keys(tokens) as TokenSymbol[]).map((symbol) => (
                <button key={symbol} type="button" onClick={() => selectToken(symbol)}>
                  <TokenIcon symbol={symbol} />
                  <span><strong>{tokens[symbol].name}</strong><small>{symbol}</small></span>
                  <b>{connected ? tokens[symbol].balance : "—"}</b>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {approvalOpen && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal compact-trade-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title">
            <button className="app-modal-close" type="button" aria-label="Close approval" onClick={() => setApprovalOpen(false)}>×</button>
            <TokenIcon symbol={fromToken} />
            <h2 id="approval-title">Approve {fromToken}</h2>
            <p>Allow the Dubu router contract to use your {fromToken} for this trade. This is required once per token.</p>
            <button className="app-primary-button" type="button" onClick={approveToken}>Approve in wallet</button>
            <button className="app-quiet-button" type="button" onClick={() => setApprovalOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {reviewOpen && quote && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal trade-review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <button className="app-modal-close" type="button" aria-label="Close review" onClick={() => setReviewOpen(false)}>×</button>
            <h2 id="review-title">Review {mode.toLowerCase()}</h2>
            <div className="review-token-line"><TokenIcon symbol={fromToken} /><span>You pay</span><strong>{amount} {fromToken}</strong></div>
            <div className="review-arrow">↓</div>
            <div className="review-token-line"><TokenIcon symbol={toToken} /><span>You receive</span><strong>{formatTokenAmount(quote.output, toToken)} {toToken}</strong></div>
            <dl className="review-details">
              <div><dt>Rate</dt><dd>1 {fromToken} = {formatTokenAmount(quote.rate, toToken)} {toToken}</dd></div>
              <div><dt>Price impact</dt><dd>{quote.impact.toFixed(2)}%</dd></div>
              <div><dt>Minimum received</dt><dd>{formatTokenAmount(quote.minimum, toToken)} {toToken}</dd></div>
              <div><dt>Network cost</dt><dd>${quote.networkCost.toFixed(2)}</dd></div>
            </dl>
            <button className="app-primary-button" type="button" onClick={submitTrade}>Confirm in wallet</button>
            <p className="wallet-confirm-note">You will confirm the final transaction in your wallet.</p>
          </div>
        </div>
      )}

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
