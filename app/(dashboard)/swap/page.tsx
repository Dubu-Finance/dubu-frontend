"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, TokenIcon, useAppWallet } from "@/app/components/AppShell";
import {
  AGGREGATOR,
  CONTRACTS,
  EXPLORER,
  PAIR_IDS,
  TOKENS,
  TOKEN_LIST,
  allowance,
  balanceOf,
  encodeApprove,
  fetchQuote,
  fromBaseUnits,
  hasMarket,
  isQuoteError,
  poolStatus,
  toBaseUnits,
  type Quote,
  type TokenSymbol,
} from "@/app/lib/dubu";

/**
 * The swap surface, wired to the live deployment.
 *
 * Every number here comes from somewhere real: the output from the aggregator, which prices the
 * prop AMM and the UniV2 pool on chain and asks the RFQ maker for a signed order; balances and the
 * allowance straight from the token contracts; the pool's remaining depth from
 * `effectiveCapacity`.
 *
 * The venue breakdown is always visible rather than hidden behind a details toggle. DuBu owns both
 * the router and one of the venues it routes to, which is exactly the arrangement people are right
 * to be suspicious of — so what each venue independently offered sits next to what was chosen, and
 * anyone can check the router did not favour its own book.
 */

const REFRESH_MS = 12_000;
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

export default function SwapPage() {
  const { connected, address, onGiwa, openWallet, switchToGiwa } = useAppWallet();

  const [fromToken, setFromToken] = useState<TokenSymbol>("mUSDC");
  const [toToken, setToToken] = useState<TokenSymbol>("mWETH");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [pickerSide, setPickerSide] = useState<"from" | "to" | null>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [balances, setBalances] = useState<Partial<Record<TokenSymbol, bigint>>>({});
  const [approved, setApproved] = useState<bigint>(0n);
  const [pool, setPool] = useState<Awaited<ReturnType<typeof poolStatus>>>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inInfo = TOKENS[fromToken];
  const outInfo = TOKENS[toToken];
  const amountIn = useMemo(() => toBaseUnits(amount, inInfo.decimals), [amount, inInfo.decimals]);
  const marketExists = hasMarket(fromToken, toToken);

  // --- balances and allowance -------------------------------------------------------------
  const refreshAccount = useCallback(async () => {
    if (!connected || !address) return;
    const owner = address as `0x${string}`;
    const entries = await Promise.all(
      TOKEN_LIST.map(
        async (t) => [t.symbol, await balanceOf(t.address, owner).catch(() => 0n)] as const,
      ),
    );
    setBalances(Object.fromEntries(entries) as Partial<Record<TokenSymbol, bigint>>);
    setApproved(
      await allowance(inInfo.address, owner, CONTRACTS.router as `0x${string}`).catch(() => 0n),
    );
  }, [connected, address, inInfo.address]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  // --- the pool's own state, which is the interesting half of "why this price" -------------
  useEffect(() => {
    const base = fromToken === "mUSDC" ? toToken : fromToken;
    const pairId = PAIR_IDS[base];
    if (!pairId) {
      setPool(null);
      return;
    }
    let alive = true;
    const tick = () => void poolStatus(pairId).then((p) => alive && setPool(p));
    tick();
    const id = setInterval(tick, 5_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fromToken, toToken]);

  // --- quoting ----------------------------------------------------------------------------
  const abort = useRef<AbortController | null>(null);

  const runQuote = useCallback(async () => {
    abort.current?.abort();
    if (amountIn <= 0n || !marketExists) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStage("quoting");
    try {
      const result = await fetchQuote({
        tokenIn: inInfo.address,
        tokenOut: outInfo.address,
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
        setQuoteError(result.detail ? `${result.error} — ${result.detail}` : result.error);
      } else {
        setQuote(result);
        setQuoteError(null);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setQuote(null);
        setQuoteError(e instanceof Error ? e.message : "could not reach the aggregator");
      }
    } finally {
      if (!controller.signal.aborted) setStage("idle");
    }
  }, [amountIn, marketExists, inInfo.address, outInfo.address, address, slippageBps]);

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
      setError(e instanceof Error ? e.message : "approval rejected");
    } finally {
      setStage("idle");
    }
  }, [quote, amountIn, send, refreshAccount]);

  const onSwap = useCallback(async () => {
    if (!quote) return;
    setError(null);
    setStage("swapping");
    try {
      const hash = await send({ to: quote.route.to, data: quote.route.data });
      setTxHash(hash);
      setAmount("");
      setQuote(null);
      setTimeout(() => void refreshAccount(), 2_500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "transaction rejected");
    } finally {
      setStage("idle");
    }
  }, [quote, send, refreshAccount]);

  const reverse = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("");
    setQuote(null);
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
    const d = quote.detail;
    const best = BigInt(quote.amountOut);
    const rows = [
      {
        key: "prop",
        label: "DuBu Prop AMM",
        out: BigInt(d.prop || "0"),
        note: "oracle-priced ladder",
        chosen: quote.route.venues.includes("prop"),
      },
      {
        key: "univ2",
        label: "UniswapV2",
        out: BigInt(d.univ2 || "0"),
        note: "constant product, 30bp fee",
        chosen: quote.route.venues.includes("univ2"),
      },
      {
        key: "rfq",
        label: "DuBu RFQ",
        out: d.rfq ? BigInt(d.rfq) : 0n,
        note: d.rfq
          ? "signed quote, priced on request"
          : d.rfqMakerReason
            ? `declined — ${d.rfqMakerReason}`
            : `unavailable — ${d.rfqRejected ?? "off"}`,
        chosen: quote.route.venues.includes("rfq"),
      },
    ];
    return rows.map((r) => ({
      ...r,
      display: r.out > 0n ? fromBaseUnits(r.out, outInfo.decimals) : null,
      deltaBps: r.out > 0n && best > 0n ? Number(((r.out - best) * 10_000n) / best) : null,
    }));
  }, [quote, outInfo.decimals]);

  const capacity = useMemo(() => {
    if (!pool) return null;
    const base = fromToken === "mUSDC" ? toToken : fromToken;
    const selling = fromToken === "mUSDC";
    const cap = selling ? pool.askCapacity : pool.bidCapacity;
    return {
      side: selling ? "can sell" : "can buy",
      amount: fromBaseUnits(cap, TOKENS[base].decimals, 2),
      symbol: base,
      age: pool.ageSecs,
      decay: pool.decaySecs,
      dying: pool.decaySecs > 0 && pool.ageSecs > pool.decaySecs / 2,
    };
  }, [pool, fromToken, toToken]);

  const primary = (() => {
    if (!connected) return { label: "Connect wallet", action: openWallet, disabled: false };
    if (!onGiwa)
      return { label: "Switch to GIWA Sepolia", action: () => void switchToGiwa(), disabled: false };
    if (!marketExists) return { label: "No market for this pair", action: () => {}, disabled: true };
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
    <div className="trade-page">
      <div className="trade-stage">
        <div className="trade-heading">
          <div>
            <h1>Swap</h1>
            <p>
              Routed across the DuBu prop AMM, its RFQ maker, and UniswapV2 on GIWA Sepolia. Every
              venue&rsquo;s independent quote is shown below.
            </p>
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
              <button
                className="dex-token-button"
                type="button"
                onClick={() => setPickerSide("from")}
              >
                <TokenIcon symbol={fromToken} />
                <span>{fromToken}</span>
                <span aria-hidden>▾</span>
              </button>
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
                <span>min {fromBaseUnits(BigInt(quote.minAmountOut), outInfo.decimals, 4)}</span>
              )}
            </div>
            <div className="dex-field-main">
              <button className="dex-token-button" type="button" onClick={() => setPickerSide("to")}>
                <TokenIcon symbol={toToken} />
                <span>{toToken}</span>
                <span aria-hidden>▾</span>
              </button>
              <input
                readOnly
                placeholder="0"
                value={outAmount}
                aria-label={`Amount of ${toToken} received`}
              />
            </div>
            <div className="dex-field-fiat">
              <span>{outInfo.name}</span>
              {price !== null && (
                <span>
                  1 {fromToken} ≈{" "}
                  {price.toLocaleString("en-US", { maximumSignificantDigits: 6 })} {toToken}
                </span>
              )}
            </div>
          </div>

          {quote && (
            <div className="dubu-venues">
              <div className="dubu-venues-head">
                <span>Where this price came from</span>
                {quote.detail.split && <span className="dubu-badge">split route</span>}
              </div>
              {venues.map((v) => (
                <div key={v.key} className={`dubu-venue-row${v.chosen ? " chosen" : ""}`}>
                  <div className="dubu-venue-name">
                    <strong>{v.label}</strong>
                    <small>{v.note}</small>
                  </div>
                  <div className="dubu-venue-out">
                    {v.display ? (
                      <>
                        <span>{v.display}</span>
                        {v.deltaBps !== null && v.deltaBps !== 0 && (
                          <small className={v.deltaBps > 0 ? "up" : "down"}>
                            {v.deltaBps > 0 ? "+" : ""}
                            {v.deltaBps} bp
                          </small>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
              ))}
              {quote.detail.split && (
                <div className="dubu-split">
                  {quote.detail.legs.map((l) => (
                    <span key={l.venue}>
                      {l.venue} {(l.weightBps / 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {capacity && (
            <div className="dubu-pool">
              <span>
                Pool {capacity.side} {capacity.amount} {capacity.symbol}
              </span>
              <span className={capacity.dying ? "warn" : ""}>
                quote {capacity.age}s old
                {capacity.decay > 0 && ` · fades at ${capacity.decay}s`}
              </span>
            </div>
          )}

          <div className="dubu-slippage">
            <span>Max slippage</span>
            <div>
              {[10, 50, 100].map((bps) => (
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

          <p className="dubu-footnote">
            Quotes from <code>{AGGREGATOR.replace(/^https?:\/\//, "")}</code>. It holds no keys and
            takes no custody — it returns calldata your wallet signs, and the minimum received is
            inside what you sign.
          </p>
        </Panel>
      </div>

      {pickerSide && (
        <div
          className="dubu-picker-backdrop"
          onClick={() => setPickerSide(null)}
          role="presentation"
        >
          <div
            className="dubu-picker"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Select token"
          >
            <h3>Select a token</h3>
            {TOKEN_LIST.map((t) => {
              const other = pickerSide === "from" ? toToken : fromToken;
              const unavailable = t.symbol !== other && !hasMarket(t.symbol, other);
              return (
                <button
                  key={t.symbol}
                  type="button"
                  disabled={t.symbol === other || unavailable}
                  onClick={() => {
                    if (pickerSide === "from") setFromToken(t.symbol);
                    else setToToken(t.symbol);
                    setPickerSide(null);
                    setQuote(null);
                  }}
                >
                  <TokenIcon symbol={t.symbol} />
                  <div>
                    <strong>{t.symbol}</strong>
                    <small>
                      {t.name} · tracks {t.tracks}
                    </small>
                  </div>
                  <span className="muted">
                    {unavailable
                      ? "no market"
                      : connected
                        ? fromBaseUnits(balances[t.symbol] ?? 0n, t.decimals, 4)
                        : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
