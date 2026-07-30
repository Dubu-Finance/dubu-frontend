"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Panel, TokenIcon, useAppWallet } from "@/app/components/AppShell";
import { TokenPicker } from "@/app/components/TokenPicker";
import { TransactionStatusModal } from "@/app/components/TransactionStatusModal";
import {
  TOKENS,
  TOKEN_LIST,
  counterpartFor,
  fromBaseUnits,
  hasMarket,
  type TokenSymbol,
} from "@/app/lib/dubu";
import { useSwapExecution } from "@/app/lib/swap-execution";

const swapTokens = TOKEN_LIST.filter((token) => token.symbol !== "mSPCX");

function SwapPageContent() {
  const { connected, address, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const searchParams = useSearchParams();

  const [fromToken, setFromToken] = useState<TokenSymbol>("mUSDC");
  const [toToken, setToToken] = useState<TokenSymbol>("mWETH");
  const [amount, setAmount] = useState("");
  const [pickerSide, setPickerSide] = useState<"from" | "to" | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const clearAmount = useCallback(() => setAmount(""), []);
  const {
    quote,
    quoteError,
    stage,
    balances,
    balance,
    transaction,
    error,
    amountIn,
    marketExists,
    marketConfigured,
    needsApproval,
    insufficient,
    slippageBps,
    setSlippageBps,
    setTransaction,
    clearQuote,
    onApprove,
    onSwap,
  } = useSwapExecution({
    fromSymbol: fromToken,
    toSymbol: toToken,
    amount,
    connected,
    address,
    enabled: true,
    onSubmitted: clearAmount,
  });

  const inInfo = TOKENS[fromToken];
  const outInfo = TOKENS[toToken];

  useEffect(() => {
    const requestedFrom = searchParams.get("from") as TokenSymbol | null;
    const requestedTo = searchParams.get("to") as TokenSymbol | null;
    const requestedAmount = searchParams.get("amount") ?? "";
    if (
      requestedFrom &&
      requestedTo &&
      TOKENS[requestedFrom] &&
      TOKENS[requestedTo] &&
      requestedFrom !== "mSPCX" &&
      requestedTo !== "mSPCX" &&
      hasMarket(requestedFrom, requestedTo)
    ) {
      setFromToken(requestedFrom);
      setToToken(requestedTo);
      if (/^\d*\.?\d*$/.test(requestedAmount)) setAmount(requestedAmount);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!pickerSide) return;

    const closePicker = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerSide(null);
    };

    document.addEventListener("pointerdown", closePicker);
    return () => document.removeEventListener("pointerdown", closePicker);
  }, [pickerSide]);

  const reverse = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("");
    clearQuote();
  };

  // Picking a token always works. Markets are a star around mUSDC, so most picks have no market
  // against whatever is on the other side; rather than grey out seven of eight rows and ask the
  // user to reason about that graph, the other side moves to a token the pick does trade with.
  const selectToken = (side: "from" | "to", symbol: TokenSymbol) => {
    const other = side === "from" ? toToken : fromToken;
    const nextOther = counterpartFor(symbol, other) ?? other;
    if (side === "from") {
      setFromToken(symbol);
      setToToken(nextOther);
    } else {
      setToToken(symbol);
      setFromToken(nextOther);
    }
    setPickerSide(null);
    clearQuote();
  };

  const tokenDropdown = (side: "from" | "to") =>
    pickerSide === side ? (
      <TokenPicker
        tokens={swapTokens}
        selected={side === "from" ? fromToken : toToken}
        otherSide={side === "from" ? toToken : fromToken}
        balances={balances}
        connected={connected}
        label={`Select ${side} token`}
        onSelect={(symbol) => selectToken(side, symbol)}
      />
    ) : null;

  // --- derived ----------------------------------------------------------------------------
  const outAmount = quote ? fromBaseUnits(BigInt(quote.amountOut), outInfo.decimals) : "";

  const price = useMemo(() => {
    if (!quote || amountIn === 0n) return null;
    const outN = Number(
      fromBaseUnits(BigInt(quote.amountOut), outInfo.decimals, 12).replace(/,/g, ""),
    );
    const inN = Number(fromBaseUnits(amountIn, inInfo.decimals, 12).replace(/,/g, ""));
    if (!outN || !inN) return null;
    return outN / inN;
  }, [quote, amountIn, inInfo.decimals, outInfo.decimals]);

  const venues = useMemo(() => {
    if (!quote) return [];
    const rows = [
      {
        key: "prop",
        label: "Dubu Prop AMM",
        source: "Onchain liquidity",
        out: BigInt(quote.detail.prop || "0"),
      },
      {
        key: "univ2",
        label: "Uniswap V2",
        source: "Liquidity pool",
        out: BigInt(quote.detail.univ2 || "0"),
      },
      {
        key: "rfq",
        label: "Dubu RFQ",
        source: "Market maker",
        out: quote.detail.rfq ? BigInt(quote.detail.rfq) : 0n,
      },
    ];

    return rows.map((venue) => ({
      ...venue,
      chosen: quote.route.venues.includes(venue.key),
      display: venue.out > 0n ? fromBaseUnits(venue.out, outInfo.decimals) : null,
    }));
  }, [quote, outInfo.decimals]);

  const primary = (() => {
    if (!connected) return { label: "Connect wallet", action: openWallet, disabled: false };
    if (!onGiwa)
      return { label: "Switch network", action: () => void switchToGiwa(), disabled: false };
    if (!marketExists) return { label: "No market for this pair", action: () => {}, disabled: true };
    if (!marketConfigured) return { label: "Market setup pending", action: () => {}, disabled: true };
    if (amountIn <= 0n) return { label: "Enter an amount", action: () => {}, disabled: true };
    if (insufficient) return { label: `Not enough ${fromToken}`, action: () => {}, disabled: true };
    if (stage === "quoting") return { label: "Finding best route…", action: () => {}, disabled: true };
    if (!quote)
      return { label: quoteError ? "No route" : "Enter an amount", action: () => {}, disabled: true };
    if (needsApproval)
      return {
        label: stage === "approving" ? "Approving…" : `Approve ${fromToken}`,
        action: () => void onApprove(),
        disabled: stage !== "idle",
      };
    return {
      label: stage === "swapping" ? "Confirm in wallet…" : "Swap",
      action: () => void onSwap(),
      disabled: stage !== "idle",
    };
  })();

  return (
    <div className="trade-page swap-centered-page">
      <div className="trade-stage">
        <div className="trade-heading">
          <div>
            <h1>Swap</h1>
          </div>
        </div>

        <Panel className="dex-swap-card">
          <div className="dex-token-field">
            <div className="dex-field-label">
              <span>You pay</span>
              {connected && (
                <span>
                  Balance {fromBaseUnits(balance, inInfo.decimals, 4)} {fromToken}
                </span>
              )}
            </div>
            <div className="dex-field-main">
              <div className="swap-token-dropdown-wrap" ref={pickerSide === "from" ? pickerRef : undefined}>
                <button
                  className="dex-token-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={pickerSide === "from"}
                  onClick={() => setPickerSide((current) => current === "from" ? null : "from")}
                >
                  <TokenIcon symbol={fromToken} />
                  <span>{fromToken}</span>
                  <span aria-hidden>▾</span>
                </button>
                {tokenDropdown("from")}
              </div>
              <input
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
                }}
                aria-label={`Amount of ${fromToken} to swap`}
              />
            </div>
            <div className="dex-field-fiat">
              <span>{inInfo.name}</span>
              {connected && balance > 0n && (
                <button
                  type="button"
                  onClick={() =>
                    setAmount(fromBaseUnits(balance, inInfo.decimals, 8).replace(/,/g, ""))
                  }
                >
                  Max
                </button>
              )}
            </div>
          </div>

          <button
            className="dex-reverse"
            type="button"
            onClick={reverse}
            aria-label="Reverse token pair"
          >
            ↓
          </button>

          <div className="dex-token-field output">
            <div className="dex-field-label">
              <span>You receive</span>
              {quote && (
                <span key={quote.minAmountOut} className="swap-price-updated">
                  min {fromBaseUnits(BigInt(quote.minAmountOut), outInfo.decimals, 4)}
                </span>
              )}
            </div>
            <div className="dex-field-main">
              <div className="swap-token-dropdown-wrap" ref={pickerSide === "to" ? pickerRef : undefined}>
                <button
                  className="dex-token-button"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={pickerSide === "to"}
                  onClick={() => setPickerSide((current) => current === "to" ? null : "to")}
                >
                  <TokenIcon symbol={toToken} />
                  <span>{toToken}</span>
                  <span aria-hidden>▾</span>
                </button>
                {tokenDropdown("to")}
              </div>
              <input
                key={quote?.amountOut ?? "empty"}
                className={quote ? "swap-price-updated" : ""}
                readOnly
                placeholder="0"
                value={outAmount}
                aria-label={`Amount of ${toToken} received`}
              />
            </div>
            <div className="dex-field-fiat">
              <span>{outInfo.name}</span>
              {price !== null && (
                <span key={quote?.amountOut} className="swap-price-updated">
                  1 {fromToken} ≈{" "}
                  {price.toLocaleString("en-US", { maximumSignificantDigits: 6 })} {toToken}
                </span>
              )}
            </div>
          </div>

          {quote && (
            <div className="dubu-venues">
              <div className="dubu-venues-head">
                <span>Route</span>
                {quote.detail.split && <span className="dubu-badge">Split</span>}
              </div>
              {venues.map((venue) => (
                <div key={venue.key} className={`dubu-venue-row${venue.chosen ? " chosen" : ""}`}>
                  <div className="dubu-venue-name">
                    <strong>{venue.label}</strong>
                    <small>{venue.source}</small>
                  </div>
                  <div className="dubu-venue-out">
                    {venue.display ? (
                      <>
                        <span key={`${venue.key}-${venue.display}`} className="swap-price-updated">
                          {venue.display}
                        </span>
                        {venue.chosen && <small className="up">Selected</small>}
                      </>
                    ) : (
                      <span className="muted">Not available</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="dubu-slippage">
            <span>Max slippage</span>
            <div>
              {(![10, 50, 100].includes(slippageBps) ? [slippageBps, 10, 50, 100] : [10, 50, 100]).map((bps) => (
                <button
                  key={bps}
                  type="button"
                  className={slippageBps === bps ? "active" : ""}
                  onClick={() => setSlippageBps(bps)}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>
          </div>

          {quoteError && <div className="dubu-alert">{quoteError}</div>}
          {error && <div className="dubu-alert">{error}</div>}

          <button
            className="app-primary-button dex-action-button"
            type="button"
            onClick={primary.action}
            disabled={primary.disabled}
          >
            {primary.label}
          </button>

        </Panel>
      </div>

      {transaction && (
        <TransactionStatusModal
          transaction={transaction}
          onClose={() => setTransaction(null)}
        />
      )}
    </div>
  );
}

export default function SwapPage() {
  return (
    <Suspense
      fallback={(
        <div className="trade-page swap-centered-page">
          <div className="trade-stage">
            <Panel className="dex-swap-card">
              <div className="terminal-orders-empty">
                <strong>Loading swap</strong>
                <p>Preparing markets and wallet state…</p>
              </div>
            </Panel>
          </div>
        </div>
      )}
    >
      <SwapPageContent />
    </Suspense>
  );
}
