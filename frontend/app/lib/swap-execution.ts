"use client";

/**
 * The market-swap pipeline: quote, approve, send, watch the receipt.
 *
 * This lives outside the pages because /swap and /trade execute the *same* trade -- the aggregator
 * quote, the unlimited approval to the Router, the re-quote before signing -- and the two copies
 * that would otherwise exist would drift apart exactly where it hurts, in the freshness rules that
 * decide whether a taker pays gas for a reverted route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONTRACTS,
  MAX_APPROVAL,
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

export type SwapStage = "idle" | "quoting" | "approving" | "swapping";

type TransactionReceipt = {
  status?: string;
  blockNumber?: string;
  logs?: Array<{ address?: string; data?: string }>;
};

export type TransactionFlow = {
  action: "approval" | "swap";
  state: "wallet" | "pending" | "success" | "failed" | "delayed";
  hash?: string;
  fromSymbol: TokenSymbol;
  toSymbol?: TokenSymbol;
  amountIn?: string;
  amountOut?: string;
  message?: string;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForReceipt(hash: string): Promise<TransactionReceipt | null> {
  const eth = provider();
  if (!eth) throw new Error("Wallet provider unavailable");

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const receipt = await eth.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    }) as TransactionReceipt | null;
    if (receipt?.blockNumber) return receipt;
    await wait(1_500);
  }
  return null;
}

function routeExecutionAmounts(receipt: TransactionReceipt) {
  const routeLog = receipt.logs?.find(
    (log) => log.address?.toLowerCase() === CONTRACTS.router.toLowerCase()
      && (log.data?.length ?? 0) >= 2 + 64 * 5,
  );
  if (!routeLog?.data) return null;
  const word = (index: number) =>
    BigInt(`0x${routeLog.data?.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
  return { amountIn: word(1), amountOut: word(2) };
}

function receiptSucceeded(receipt: TransactionReceipt) {
  return Boolean(receipt.status) && BigInt(receipt.status as string) === 1n;
}

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

export type SwapExecutionOptions = {
  fromSymbol: TokenSymbol;
  toSymbol: TokenSymbol;
  amount: string;
  connected: boolean;
  address: string | null;
  /** False parks the hook: no quoting, no polling, no account reads. */
  enabled?: boolean;
  /** Fired once the swap has a transaction hash, so the page can clear its amount field. */
  onSubmitted?: () => void;
};

export function useSwapExecution({
  fromSymbol,
  toSymbol,
  amount,
  connected,
  address,
  enabled = true,
  onSubmitted,
}: SwapExecutionOptions) {
  const transactionBusyRef = useRef(false);
  const quoteRef = useRef<Quote | null>(null);
  const quoteKeyRef = useRef("");
  const abort = useRef<AbortController | null>(null);

  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [stage, setStage] = useState<SwapStage>("idle");
  const [balances, setBalances] = useState<Partial<Record<TokenSymbol, bigint>>>({});
  const [approved, setApproved] = useState<bigint>(0n);
  const [transaction, setTransaction] = useState<TransactionFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inInfo = TOKENS[fromSymbol];
  const outInfo = TOKENS[toSymbol];
  const amountIn = useMemo(() => toBaseUnits(amount, inInfo.decimals), [amount, inInfo.decimals]);
  const marketExists = hasMarket(fromSymbol, toSymbol);
  const marketConfigured = isMarketConfigured(fromSymbol, toSymbol);

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
  const refreshAccount = useCallback(async (minimumAllowance = 0n) => {
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
    const onchainAllowance = inInfo.address
      ? await allowance(inInfo.address, owner, CONTRACTS.router as `0x${string}`).catch(() => 0n)
      : 0n;
    setApproved(onchainAllowance >= minimumAllowance ? onchainAllowance : minimumAllowance);
  }, [connected, address, inInfo.address]);

  useEffect(() => {
    if (!enabled) return;
    void refreshAccount();
  }, [enabled, refreshAccount]);

  // --- quoting ----------------------------------------------------------------------------
  const quoteContextKey = [
    inInfo.address ?? "",
    outInfo.address ?? "",
    amountIn.toString(),
    address,
    slippageBps,
  ].join(":");

  useEffect(() => {
    quoteRef.current = null;
    quoteKeyRef.current = "";
    setQuote(null);
    setQuoteError(null);
  }, [quoteContextKey]);

  const runQuote = useCallback(async () => {
    if (transactionBusyRef.current) return;
    abort.current?.abort();
    const tokenIn = inInfo.address;
    const tokenOut = outInfo.address;
    if (!enabled || amountIn <= 0n || !marketExists || !marketConfigured || !tokenIn || !tokenOut) {
      quoteRef.current = null;
      quoteKeyRef.current = "";
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const isBackgroundRefresh = quoteRef.current !== null
      && quoteKeyRef.current === quoteContextKey;
    const controller = new AbortController();
    abort.current = controller;
    if (!isBackgroundRefresh) setStage("quoting");
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
        if (!isBackgroundRefresh) {
          quoteRef.current = null;
          quoteKeyRef.current = "";
          setQuote(null);
        }
        setQuoteError(quoteErrorMessage(`${result.error} ${result.detail ?? ""}`));
      } else {
        quoteRef.current = result;
        quoteKeyRef.current = quoteContextKey;
        setQuote(result);
        setQuoteError(null);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        if (!isBackgroundRefresh) {
          quoteRef.current = null;
          quoteKeyRef.current = "";
          setQuote(null);
        }
        setQuoteError(quoteErrorMessage(e instanceof Error ? e.message : ""));
      }
    } finally {
      if (!controller.signal.aborted && !isBackgroundRefresh) setStage("idle");
    }
  }, [
    enabled,
    amountIn,
    marketExists,
    marketConfigured,
    inInfo.address,
    outInfo.address,
    address,
    slippageBps,
    quoteContextKey,
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
    transactionBusyRef.current = true;
    setStage("approving");
    setTransaction({
      action: "approval",
      state: "wallet",
      fromSymbol,
      amountIn: fromBaseUnits(amountIn, inInfo.decimals, 8),
    });
    try {
      const hash = await send({
        to: quote.approve.token,
        // Unlimited, not `amountIn`. An exact approval is consumed by the swap it was granted for,
        // so the next swap needs another one -- which is why this asked for two confirmations on
        // every single trade.
        data: encodeApprove(quote.approve.spender, MAX_APPROVAL),
      });
      setTransaction((current) => current ? { ...current, state: "pending", hash } : current);
      const receipt = await waitForReceipt(hash);
      if (!receipt) {
        setTransaction((current) => current ? { ...current, state: "delayed" } : current);
        return;
      }
      if (!receiptSucceeded(receipt)) {
        setTransaction((current) => current ? {
          ...current,
          state: "failed",
          message: "The approval transaction reverted.",
        } : current);
        return;
      }
      // What was actually granted, so `needsApproval` stays false for the rest of the session
      // rather than only for trades no larger than this one.
      setApproved((current) => current >= MAX_APPROVAL ? current : MAX_APPROVAL);
      setTransaction((current) => current ? { ...current, state: "success" } : current);
      await refreshAccount(amountIn);
    } catch (e) {
      const message = walletErrorMessage(e, "Approval wasn’t completed.");
      setError(message);
      setTransaction((current) => current ? { ...current, state: "failed", message } : current);
    } finally {
      transactionBusyRef.current = false;
      setStage("idle");
    }
  }, [quote, amountIn, send, refreshAccount, fromSymbol, inInfo.decimals]);

  const onSwap = useCallback(async () => {
    const tokenIn = inInfo.address;
    const tokenOut = outInfo.address;
    if (!quote || !tokenIn || !tokenOut) return;
    setError(null);
    transactionBusyRef.current = true;
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
      const submittedAmountIn = fromBaseUnits(amountIn, inInfo.decimals, 8);
      const expectedAmountOut = fromBaseUnits(BigInt(fresh.amountOut), outInfo.decimals, 8);
      setTransaction({
        action: "swap",
        state: "wallet",
        fromSymbol,
        toSymbol,
        amountIn: submittedAmountIn,
        amountOut: expectedAmountOut,
      });
      const hash = await send({ to: fresh.route.to, data: fresh.route.data });
      setTransaction((current) => current ? { ...current, state: "pending", hash } : current);
      onSubmitted?.();
      setQuote(null);
      const receipt = await waitForReceipt(hash);
      if (!receipt) {
        setTransaction((current) => current ? { ...current, state: "delayed" } : current);
        return;
      }
      if (!receiptSucceeded(receipt)) {
        setTransaction((current) => current ? {
          ...current,
          state: "failed",
          message: "The swap reverted before execution.",
        } : current);
        return;
      }

      const executed = routeExecutionAmounts(receipt);
      setTransaction((current) => current ? {
        ...current,
        state: "success",
        amountIn: executed
          ? fromBaseUnits(executed.amountIn, inInfo.decimals, 8)
          : submittedAmountIn,
        amountOut: executed
          ? fromBaseUnits(executed.amountOut, outInfo.decimals, 8)
          : expectedAmountOut,
      } : current);
      await refreshAccount();
      window.setTimeout(() => void refreshAccount(), 1_500);
    } catch (e) {
      const message = walletErrorMessage(e, "Swap wasn’t completed.");
      setError(message);
      setTransaction((current) => current ? { ...current, state: "failed", message } : current);
    } finally {
      transactionBusyRef.current = false;
      setStage("idle");
    }
  }, [
    quote,
    send,
    refreshAccount,
    onSubmitted,
    amountIn,
    address,
    slippageBps,
    fromSymbol,
    toSymbol,
    inInfo.address,
    inInfo.decimals,
    outInfo.address,
    outInfo.decimals,
  ]);

  const clearQuote = useCallback(() => setQuote(null), []);

  const balance = balances[fromSymbol] ?? 0n;

  return {
    quote,
    quoteError,
    stage,
    balances,
    balance,
    approved,
    transaction,
    error,
    amountIn,
    marketExists,
    marketConfigured,
    needsApproval: quote !== null && approved < amountIn,
    insufficient: amountIn > balance,
    slippageBps,
    setSlippageBps,
    setTransaction,
    clearQuote,
    refreshAccount,
    onApprove,
    onSwap,
  };
}
