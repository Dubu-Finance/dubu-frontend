"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, TokenIcon, useAppWallet } from "@/app/components/AppShell";
import {
  CONTRACTS,
  EXPLORER,
  TOKENS,
  TOKEN_LIST,
  allowance,
  balanceOf,
  encodeApprove,
  fetchQuote,
  fromBaseUnits,
  hasMarket,
  isMarketConfigured,
  isQuoteError,
  toBaseUnits,
  type Quote,
  type TokenSymbol,
} from "@/app/lib/dubu";

// How often the displayed quote is re-fetched.
//
// It was 12s, which is not a number this system can support: the pool re-quotes every ~590ms and
// the RFQ maker signs orders with a 2s TTL, so a 12s-old quote carried an RFQ order that had been
// dead for ten of those seconds. The RFQ leg could be displayed but essentially never executed.
//
// 2.5s for the display. Freshness at signing time is not this interval's job -- see `onSwap`,
// which re-quotes before it sends, because no polling interval can make a quote fresh at the
// unpredictable moment a user decides to click.
const REFRESH_MS = 2_500;
const DEBOUNCE_MS = 350;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function provider(): EthereumProvider | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

type Stage = "idle" | "quoting" | "approving" | "swapping";

function quoteErrorMessage(reason = "") {
  const normalized = reason.toLowerCase();
  if (normalized.includes("market") || normalized.includes("pair")) {
    return "This pair is not available.";
  }
  if (normalized.includes("amount") || normalized.includes("liquidity")) {
    return "Try a different amount.";
  }
  return "A quote isn’t available right now.";
}

function walletErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return "Request cancelled.";
  }
  return fallback;
}

export default function SwapPage() {
  const { connected, address, onGiwa, openWallet, switchToGiwa } = useAppWallet();

  const [fromToken, setFromToken] = useState<TokenSymbol>("mUSDT");
  const [toToken, setToToken] = useState<TokenSymbol>("mWETH");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [pickerSide, setPickerSide] = useState<"from" | "to" | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [balances, setBalances] = useState<Partial<Record<TokenSymbol, bigint>>>({});
  const [approved, setApproved] = useState<bigint>(0n);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inInfo = TOKENS[fromToken];
  const outInfo = TOKENS[toToken];
  const amountIn = useMemo(() => toBaseUnits(amount, inInfo.decimals), [amount, inInfo.decimals]);
  const marketExists = hasMarket(fromToken, toToken);
  const marketConfigured = isMarketConfigured(fromToken, toToken);

  useEffect(() => {
    if (!pickerSide) return;

    const closePicker = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerSide(null);
    };

    document.addEventListener("pointerdown", closePicker);
    return () => document.removeEventListener("pointerdown", closePicker);
  }, [pickerSide]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("dubu-trade-settings") ?? "{}") as {
        slippage?: string;
      };
      const nextSlippage = Number(saved.slippage);
      if (Number.isFinite(nextSlippage) && nextSlippage > 0 && nextSlippage <= 50) {
        setSlippageBps(Math.round(nextSlippage * 100));
      }
    } catch {
      // Keep the default when stored preferences are invalid.
    }
  }, []);

  // --- balances and allowance -------------------------------------------------------------
  const refreshAccount = useCallback(async () => {
    if (!connected || !address) return;
    const owner = address as `0x${string}`;
    const entries = await Promise.all(
      TOKEN_LIST.map(
        async (t) => [
          t.symbol,
          t.address ? await balanceOf(t.address, owner).catch(() => 0n) : 0n,
        ] as const,
      ),
    );
    setBalances(Object.fromEntries(entries) as Partial<Record<TokenSymbol, bigint>>);
    setApproved(inInfo.address
      ? await allowance(inInfo.address, owner, CONTRACTS.router as `0x${string}`).catch(() => 0n)
      : 0n);
  }, [connected, address, inInfo.address]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  // --- quoting ----------------------------------------------------------------------------
  const abort = useRef<AbortController | null>(null);

  const runQuote = useCallback(async () => {
    abort.current?.abort();
    const tokenIn = inInfo.address;
    const tokenOut = outInfo.address;
    if (amountIn <= 0n || !marketExists || !marketConfigured || !tokenIn || !tokenOut) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStage("quoting");
    try {
      const result = await fetchQuote({
        tokenIn,
        tokenOut,
        amountIn,
        // A quote is priced for a receiver and before a wallet is connected there is not one. The
        // placeholder produces an identical price; the calldata it comes back with is never used,
        // because the button is not a swap button until a wallet is attached.
        receiver: (address || "0x0000000000000000000000000000000000000001") as `0x${string}`,
        slippageBps,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (isQuoteError(result)) {
        setQuote(null);
        setQuoteError(quoteErrorMessage(`${result.error} ${result.detail ?? ""}`));
      } else {
        setQuote(result);
        setQuoteError(null);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setQuote(null);
        setQuoteError(quoteErrorMessage(e instanceof Error ? e.message : ""));
      }
    } finally {
      if (!controller.signal.aborted) setStage("idle");
    }
  }, [
    amountIn,
    marketExists,
    marketConfigured,
    inInfo.address,
    outInfo.address,
    address,
    slippageBps,
  ]);

  useEffect(() => {
    const id = setTimeout(() => void runQuote(), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [runQuote]);

  useEffect(() => {
    const id = setInterval(() => void runQuote(), REFRESH_MS);
    return () => clearInterval(id);
  }, [runQuote]);

  // --- actions ----------------------------------------------------------------------------
  const send = useCallback(
    async (tx: { to: string; data: string; value?: string }) => {
      const eth = provider();
      if (!eth || !address) throw new Error("no wallet");
      return (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: tx.to, data: tx.data, value: tx.value ?? "0x0" }],
      })) as string;
    },
    [address],
  );

  const onApprove = useCallback(async () => {
    if (!quote) return;
    setError(null);
    setStage("approving");
    try {
      const hash = await send({
        to: quote.approve.token,
        data: encodeApprove(quote.approve.spender, amountIn),
      });
      setTxHash(hash);
      // The wallet returns as soon as the node accepts it; the allowance changes a block later.
      setTimeout(() => void refreshAccount(), 2_500);
    } catch (e) {
      setError(walletErrorMessage(e, "Approval wasn’t completed."));
    } finally {
      setStage("idle");
    }
  }, [quote, amountIn, send, refreshAccount]);

  const onSwap = useCallback(async () => {
    const tokenIn = inInfo.address;
    const tokenOut = outInfo.address;
    if (!quote || !tokenIn || !tokenOut) return;
    setError(null);
    setStage("swapping");
    try {
      // Re-quote before signing rather than sending what is on screen.
      //
      // The displayed quote is up to REFRESH_MS old and the click lands at an unpredictable moment
      // inside that window, so the route in state can carry an RFQ order whose 2s TTL has expired
      // -- which does not mis-price, it reverts, and the taker pays gas to learn that.
      //
      // The user's protection is unchanged: they still cannot receive less than the minimum they
      // were shown, because a fresh quote worse than that minimum is refused here rather than
      // signed. Slippage tolerance is what the displayed minimum already encodes; this only stops
      // it being silently re-based on a newer, worse price.
      const fresh = await fetchQuote({
        tokenIn,
        tokenOut,
        amountIn,
        receiver: address as `0x${string}`,
        slippageBps,
      });
      if (isQuoteError(fresh)) {
        setError(quoteErrorMessage(`${fresh.error} ${fresh.detail ?? ""}`));
        return;
      }
      if (BigInt(fresh.amountOut) < BigInt(quote.minAmountOut)) {
        setError("Price moved beyond your minimum. Review the updated quote and try again.");
        return;
      }
      setQuote(fresh);
      const hash = await send({ to: fresh.route.to, data: fresh.route.data });
      setTxHash(hash);
      setAmount("");
      setQuote(null);
      setTimeout(() => void refreshAccount(), 2_500);
    } catch (e) {
      setError(walletErrorMessage(e, "Swap wasn’t completed."));
    } finally {
      setStage("idle");
    }
  }, [
    quote,
    send,
    refreshAccount,
    amountIn,
    address,
    slippageBps,
    inInfo.address,
    outInfo.address,
    outInfo.decimals,
    outInfo.symbol,
  ]);

  const reverse = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("");
    setQuote(null);
  };

  const tokenDropdown = (side: "from" | "to") => {
    if (pickerSide !== side) return null;
    const other = side === "from" ? toToken : fromToken;

    return (
      <div className="dubu-token-dropdown" role="listbox" aria-label={`Select ${side} token`}>
        <div className="dubu-token-dropdown-head">
          <strong>Select token</strong>
          <span>GIWA Sepolia</span>
        </div>
        {TOKEN_LIST.map((token) => {
          const unavailable = token.symbol !== other && !hasMarket(token.symbol, other);
          const selected = token.symbol === (side === "from" ? fromToken : toToken);
          return (
            <button
              key={token.symbol}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={token.symbol === other || unavailable}
              onClick={() => {
                if (side === "from") setFromToken(token.symbol);
                else setToToken(token.symbol);
                setPickerSide(null);
                setQuote(null);
              }}
            >
              <TokenIcon symbol={token.symbol} />
              <span>
                <strong>{token.symbol}</strong>
                <small>{token.name}</small>
              </span>
              <b>
                {unavailable
                  ? "No market"
                  : !token.address
                    ? "Placeholder"
                  : connected
                    ? fromBaseUnits(balances[token.symbol] ?? 0n, token.decimals, 4)
                    : selected
                      ? "Selected"
                      : ""}
              </b>
            </button>
          );
        })}
      </div>
    );
  };

  // --- derived ----------------------------------------------------------------------------
  const outAmount = quote ? fromBaseUnits(BigInt(quote.amountOut), outInfo.decimals) : "";
  const needsApproval = quote !== null && approved < amountIn;
  const balance = balances[fromToken] ?? 0n;
  const insufficient = amountIn > balance;

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
        label: "Dubu",
        source: "AMM",
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
      return { label: "Switch to GIWA Sepolia", action: () => void switchToGiwa(), disabled: false };
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

          {txHash && (
            <a
              className="dubu-txlink"
              href={`${EXPLORER}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          )}

        </Panel>
      </div>
    </div>
  );
}
