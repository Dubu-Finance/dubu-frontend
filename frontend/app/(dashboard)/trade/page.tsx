"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  Toast,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import { TransactionStatusModal } from "@/app/components/TransactionStatusModal";
import {
  EXPLORER,
  MAX_APPROVAL,
  TOKENS,
  TOKEN_LIST,
  allowance,
  balanceOf,
  encodeApprove,
  fromBaseUnits,
  hasMarket,
  isMarketConfigured,
  toBaseUnits,
  type TokenSymbol,
} from "@/app/lib/dubu";
import { useSwapExecution } from "@/app/lib/swap-execution";
import {
  fetchMarketSnapshot,
  subscribeToMarket,
  type MarketCandle,
  type MarketTicker,
  type StoredCandle,
} from "@/app/lib/market-data";
import {
  calculateLimitOutput,
  cancelLimitOrder,
  cancellationTypedData,
  createLimitOrder,
  encodeOnchainCancellation,
  expiryTimestamp,
  fetchLimitOrderConfig,
  fetchLimitOrders,
  limitOrderTypedData,
  randomOrderSalt,
  subscribeToOrders,
  symbolForOrderToken,
  type LimitOrderConfig,
  type LimitOrderMessage,
  type LimitOrderRecord,
} from "@/app/lib/limit-orders";

type TradeBaseSymbol = Exclude<TokenSymbol, "mUSDC" | "mSPCX">;
type PairKey = `${TradeBaseSymbol}/mUSDC`;
type OrderMode = "Market" | "Limit";
type OrderTab = "Active" | "History";
type ChartInterval = "5m" | "15m" | "1h" | "4h";
type MarketData = {
  source: string;
  generatedAt: number;
  ticker: MarketTicker;
  candles: MarketCandle[];
};

type EthereumProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type OrderActionState = "idle" | "approving" | "signing" | "submitting" | "cancelling";
type TradeErrorState = {
  title: string;
  message: string;
  context: "orders" | "ticket";
};
type FillNotice = {
  orderHash: string;
  pair: string;
  side: "buy" | "sell";
  received: string;
  receivedSymbol: TokenSymbol;
  executionPrice: number;
  transactionHash: string | null;
};

const pairs: Record<PairKey, {
  base: TradeBaseSymbol;
  quote: "mUSDC";
  dataId: string | null;
}> = {
  "mWETH/mUSDC": { base: "mWETH", quote: "mUSDC", dataId: "mweth-musdc" },
  "mWBTC/mUSDC": { base: "mWBTC", quote: "mUSDC", dataId: "mwbtc-musdc" },
  "mBNB/mUSDC": { base: "mBNB", quote: "mUSDC", dataId: "mbnb-musdc" },
  "mXRP/mUSDC": { base: "mXRP", quote: "mUSDC", dataId: "mxrp-musdc" },
  "mSOL/mUSDC": { base: "mSOL", quote: "mUSDC", dataId: "msol-musdc" },
  "mSKHY/mUSDC": { base: "mSKHY", quote: "mUSDC", dataId: null },
  "mAAPL/mUSDC": { base: "mAAPL", quote: "mUSDC", dataId: null },
  "mTSLA/mUSDC": { base: "mTSLA", quote: "mUSDC", dataId: null },
};

const pairKeys = Object.keys(pairs) as PairKey[];

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

function ethereumProvider() {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

async function waitForTransaction(hash: string) {
  const provider = ethereumProvider();
  if (!provider) throw new Error("Wallet provider unavailable.");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    }) as { status?: string; blockNumber?: string } | null;
    if (receipt?.blockNumber) {
      if (receipt.status && BigInt(receipt.status) !== 1n) {
        throw new Error("Transaction reverted.");
      }
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }
  throw new Error("Confirmation is taking longer than expected.");
}

function shortHash(value: string) {
  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

function orderActionError(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "code" in error) {
    const code = Number((error as { code?: unknown }).code);
    if (code === 4001) return "The wallet request was cancelled.";
    if (code === -32002) {
      return "A wallet request is already open. Open your wallet extension to continue.";
    }
  }
  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

function tradeError(
  error: unknown,
  fallback: string,
  context: TradeErrorState["context"] = "ticket",
): TradeErrorState {
  const code = walletErrorCode(error);
  const rawMessage = orderActionError(error, fallback);
  const message = rawMessage.toLowerCase();

  if (code === 4001 || message.includes("user rejected") || message.includes("user denied")) {
    return {
      title: "Request cancelled",
      message: "Nothing was submitted. Review the order and try again when you’re ready.",
      context,
    };
  }
  if (code === -32002 || message.includes("already pending")) {
    return {
      title: "Check your wallet",
      message: "A wallet request is already waiting. Open your wallet extension to continue.",
      context,
    };
  }
  if (message.includes("insufficient funds") || message.includes("not enough")) {
    return {
      title: "Insufficient balance",
      message: "Your wallet does not have enough of this token, or enough gas, to complete the request.",
      context,
    };
  }
  if (message.includes("allowance") || message.includes("approve")) {
    return {
      title: "Token approval required",
      message: "Approve the token for this order, then submit it again.",
      context,
    };
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("network request") ||
    message.includes("connection")
  ) {
    return {
      title: "Connection interrupted",
      message: "We couldn’t reach the trading service. Check your connection and try again.",
      context,
    };
  }
  if (message.includes("signature")) {
    return {
      title: "Signature not completed",
      message: "The wallet did not return a valid order signature. Reopen your wallet and try again.",
      context,
    };
  }
  if (message.includes("revert") || message.includes("contract rejected")) {
    return {
      title: "Transaction could not be completed",
      message: "The contract rejected this request. Refresh the quote and try again.",
      context,
    };
  }
  if (message.includes("unavailable") || message.includes("503")) {
    return {
      title: "Trading service unavailable",
      message: "Limit orders are temporarily unavailable. Your funds remain in your wallet.",
      context,
    };
  }

  const cleanMessage = rawMessage
    .replace(/^error:\s*/i, "")
    .replace(/^execution reverted:?\s*/i, "")
    .split(/\s+\(action=|,\s*transaction=|,\s*request=/i)[0]
    .trim();
  const safeMessage = cleanMessage && cleanMessage.length <= 180 && !cleanMessage.includes("{")
    ? cleanMessage
    : fallback;
  return {
    title: context === "orders" ? "Orders couldn’t be updated" : "Order not completed",
    message: safeMessage,
    context,
  };
}

function TradeErrorAlert({
  error,
  onDismiss,
  className = "",
}: {
  error: TradeErrorState;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div className={`trade-error-alert ${className}`} role="alert">
      <span className="trade-error-icon">!</span>
      <div>
        <strong>{error.title}</strong>
        <p>{error.message}</p>
      </div>
      <button type="button" aria-label="Dismiss error" onClick={onDismiss}>×</button>
    </div>
  );
}

function walletErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? Number((error as { code?: unknown }).code)
    : 0;
}

function canRetryTypedDataRequest(error: unknown) {
  const code = walletErrorCode(error);
  if (code === 4001 || code === -32002) return false;
  const message = orderActionError(error, "").toLowerCase();
  return (
    code === -32601 ||
    code === -32602 ||
    message.includes("not supported") ||
    message.includes("unsupported") ||
    message.includes("invalid param")
  );
}

async function requestTypedDataSignature(
  provider: EthereumProvider,
  account: string,
  typedData: ReturnType<typeof limitOrderTypedData>,
) {
  const attempts: Array<{ method: string; payload: unknown }> = [
    { method: "eth_signTypedData_v4", payload: JSON.stringify(typedData) },
    { method: "eth_signTypedData_v4", payload: typedData },
    { method: "eth_signTypedData_v3", payload: JSON.stringify(typedData) },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const signature = await provider.request({
        method: attempt.method,
        params: [account, attempt.payload],
      });
      if (typeof signature !== "string" || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
        throw new Error("The wallet did not return a valid order signature.");
      }
      return signature;
    } catch (error) {
      lastError = error;
      if (!canRetryTypedDataRequest(error)) throw error;
    }
  }
  throw lastError ?? new Error("This wallet does not support typed-data signatures.");
}

function fillNoticeFromOrder(order: Partial<LimitOrderRecord>): FillNotice | null {
  if (
    !order.orderHash ||
    !order.marketId ||
    !order.side ||
    !order.tokenIn ||
    !order.tokenOut ||
    !order.actualAmountIn ||
    !order.actualAmountOut
  ) {
    return null;
  }
  const inputSymbol = symbolForOrderToken(order.tokenIn, TOKEN_LIST);
  const outputSymbol = symbolForOrderToken(order.tokenOut, TOKEN_LIST);
  if (!inputSymbol || !outputSymbol) return null;

  const listedPair = (Object.entries(pairs) as Array<
    [PairKey, (typeof pairs)[PairKey]]
  >).find(([, value]) => value.dataId === order.marketId)?.[0]
    ?? `${outputSymbol}/${inputSymbol}`;
  const inputAmount = Number(
    fromBaseUnits(BigInt(order.actualAmountIn), TOKENS[inputSymbol].decimals, 8).replace(/,/g, ""),
  );
  const outputAmount = Number(
    fromBaseUnits(BigInt(order.actualAmountOut), TOKENS[outputSymbol].decimals, 8).replace(/,/g, ""),
  );
  if (!Number.isFinite(inputAmount) || !Number.isFinite(outputAmount) || outputAmount <= 0) {
    return null;
  }

  return {
    orderHash: order.orderHash,
    pair: listedPair,
    side: order.side,
    received: fromBaseUnits(
      BigInt(order.actualAmountOut),
      TOKENS[outputSymbol].decimals,
      6,
    ),
    receivedSymbol: outputSymbol,
    executionPrice: order.side === "buy"
      ? inputAmount / outputAmount
      : outputAmount / inputAmount,
    transactionHash: order.fillTxHash ?? order.executionTxHash ?? null,
  };
}

export default function TradePage() {
  const { connected, address, onGiwa, openWallet, switchToGiwa } = useAppWallet();
  const [pairKey, setPairKey] = useState<PairKey>("mWETH/mUSDC");
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
  const [orderConfig, setOrderConfig] = useState<LimitOrderConfig | null>(null);
  const [orders, setOrders] = useState<LimitOrderRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderError, setOrderError] = useState<TradeErrorState | null>(null);
  const [orderAction, setOrderAction] = useState<OrderActionState>("idle");
  const [fillNotice, setFillNotice] = useState<FillNotice | null>(null);
  const [payBalance, setPayBalance] = useState(0n);
  const [settlementAllowance, setSettlementAllowance] = useState(0n);
  const [orderAllowances, setOrderAllowances] = useState<Record<string, bigint>>({});
  const [priceFlash, setPriceFlash] = useState<{
    direction: "up" | "down" | "";
    sequence: number;
  }>({ direction: "", sequence: 0 });
  const lastPriceRef = useRef<Record<string, number>>({});
  const announcedFillHashesRef = useRef(new Set<string>());
  const orderStatusesRef = useRef(new Map<string, LimitOrderRecord["status"]>());
  const ordersHydratedRef = useRef(false);
  const fillNoticeTimerRef = useRef<number | null>(null);

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
  const paySymbol = side === "Buy" ? pair.quote : pair.base;
  const receiveSymbol = side === "Buy" ? pair.base : pair.quote;
  const payToken = TOKENS[paySymbol];
  const receiveToken = TOKENS[receiveSymbol];
  const amountIn = toBaseUnits(amount, payToken.decimals);
  const clearAmount = useCallback(() => setAmount(""), []);
  const marketSwap = useSwapExecution({
    fromSymbol: paySymbol,
    toSymbol: receiveSymbol,
    amount,
    connected,
    address,
    enabled: mode === "Market",
    onSubmitted: clearAmount,
  });
  // The market swap is gated on the aggregator's markets rather than on `marketDataAvailable`:
  // the equity pairs carry `dataId: null` and so have no chart feed, but they quote and fill.
  const marketQuotable = hasMarket(paySymbol, receiveSymbol)
    && isMarketConfigured(paySymbol, receiveSymbol);
  const executionPrice = mode === "Limit"
    ? Number.parseFloat(limitPrice) || currentPrice || 0
    : currentPrice || 0;
  const limitAmountOut = calculateLimitOutput({
    side,
    amountIn,
    inputDecimals: payToken.decimals,
    outputDecimals: receiveToken.decimals,
    limitPrice,
  });
  const limitReceiveAmount = Number(
    fromBaseUnits(limitAmountOut, receiveToken.decimals, 8).replace(/,/g, ""),
  );
  // Market mode shows what the aggregator will actually pay out, not a price-times-amount guess.
  const receiveDisplay = mode === "Limit"
    ? hasAmount
      ? limitReceiveAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })
      : "0.00"
    : marketSwap.quote
      ? fromBaseUnits(BigInt(marketSwap.quote.amountOut), receiveToken.decimals, 6)
      : "0.00";
  const insufficientBalance = connected && amountIn > payBalance;
  const needsSettlementApproval = mode === "Limit"
    && amountIn > 0n
    && settlementAllowance < amountIn;

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
      onStatus: () => undefined,
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

  useEffect(() => {
    const controller = new AbortController();
    void fetchLimitOrderConfig(controller.signal)
      .then((config) => setOrderConfig(config))
      .catch(() => setOrderConfig({
        enabled: false,
        chainId: 91_342,
        settlementAddress: null,
        supportedExpiries: ["1 day", "7 days", "30 days"],
        maxFeeBps: 100,
      }));
    return () => controller.abort();
  }, []);

  const showFillNotice = useCallback((order: Partial<LimitOrderRecord>) => {
    if (
      !order.orderHash ||
      announcedFillHashesRef.current.has(order.orderHash)
    ) {
      return;
    }
    const notice = fillNoticeFromOrder(order);
    if (!notice) return;

    announcedFillHashesRef.current.add(notice.orderHash);
    setToast("");
    setFillNotice(notice);
    if (fillNoticeTimerRef.current !== null) {
      window.clearTimeout(fillNoticeTimerRef.current);
    }
    fillNoticeTimerRef.current = window.setTimeout(() => {
      setFillNotice(null);
      fillNoticeTimerRef.current = null;
    }, 7_000);
  }, []);

  const refreshOrders = useCallback(async ({
    silent = false,
  }: { silent?: boolean } = {}) => {
    if (!address) {
      setOrders([]);
      return;
    }
    const controller = new AbortController();
    if (!silent) setOrdersLoading(true);
    try {
      const allOrders = await fetchLimitOrders(
        address,
        "all",
        controller.signal,
      );
      const now = Date.now();
      for (const order of allOrders) {
        const previousStatus = orderStatusesRef.current.get(order.orderHash);
        const recentlyFilled = order.filledAt
          ? now - new Date(order.filledAt).getTime() < 30_000
          : false;
        if (
          order.status === "filled" &&
          (
            previousStatus === "open" ||
            previousStatus === "executing" ||
            (!ordersHydratedRef.current && recentlyFilled)
          )
        ) {
          showFillNotice(order);
        }
        orderStatusesRef.current.set(order.orderHash, order.status);
      }
      ordersHydratedRef.current = true;
      setOrders(allOrders.filter((order) =>
        orderTab === "Active"
          ? order.status === "open" || order.status === "executing"
          : order.status !== "open" && order.status !== "executing",
      ));
      setOrderError((current) => current?.context === "orders" ? null : current);
    } catch (error) {
      setOrderError((current) =>
        current?.context === "ticket"
          ? current
          : tradeError(error, "Your orders could not be loaded.", "orders"),
      );
    } finally {
      if (!silent) setOrdersLoading(false);
    }
  }, [address, orderTab, showFillNotice]);

  useEffect(() => {
    announcedFillHashesRef.current.clear();
    orderStatusesRef.current.clear();
    ordersHydratedRef.current = false;
  }, [address]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    if (!address) return;
    const reconcile = () => void refreshOrders({ silent: true });
    const intervalId = window.setInterval(reconcile, 3_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [address, refreshOrders]);

  useEffect(() => {
    if (!address) return;
    return subscribeToOrders(address, (event) => {
      if (event.action === "filled") showFillNotice(event.data);
      void refreshOrders({ silent: true });
    });
  }, [address, refreshOrders, showFillNotice]);

  useEffect(() => () => {
    if (fillNoticeTimerRef.current !== null) {
      window.clearTimeout(fillNoticeTimerRef.current);
    }
  }, []);

  const refreshTradingAccount = useCallback(async (minimumAllowance = 0n) => {
    if (!address || !payToken.address) {
      setPayBalance(0n);
      setSettlementAllowance(0n);
      return;
    }
    const [nextBalance, nextAllowance] = await Promise.all([
      balanceOf(payToken.address, address as `0x${string}`).catch(() => 0n),
      orderConfig?.settlementAddress
        ? allowance(
            payToken.address,
            address as `0x${string}`,
            orderConfig.settlementAddress,
          ).catch(() => 0n)
        : Promise.resolve(0n),
    ]);
    setPayBalance(nextBalance);
    setSettlementAllowance(
      nextAllowance >= minimumAllowance ? nextAllowance : minimumAllowance,
    );
  }, [address, orderConfig?.settlementAddress, payToken.address]);

  useEffect(() => {
    void refreshTradingAccount();
  }, [refreshTradingAccount]);

  useEffect(() => {
    if (!address || !orderConfig?.settlementAddress) {
      setOrderAllowances({});
      return;
    }
    const tokenAddresses = Array.from(new Set(
      orders
        .filter((order) => order.status === "open" || order.status === "executing")
        .map((order) => order.tokenIn.toLowerCase()),
    ));
    if (tokenAddresses.length === 0) {
      setOrderAllowances({});
      return;
    }

    let active = true;
    void Promise.all(
      tokenAddresses.map(async (tokenAddress) => [
        tokenAddress,
        await allowance(
          tokenAddress as `0x${string}`,
          address as `0x${string}`,
          orderConfig.settlementAddress as `0x${string}`,
        ).catch(() => 0n),
      ] as const),
    ).then((entries) => {
      if (active) setOrderAllowances(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [address, orderConfig?.settlementAddress, orders]);

  function selectPair(next: PairKey) {
    setPairKey(next);
    setLimitPrice("");
    setAmount("");
    setPairMenuOpen(false);
  }

  async function approveSettlement() {
    const provider = ethereumProvider();
    if (
      !provider ||
      !address ||
      !payToken.address ||
      !orderConfig?.settlementAddress ||
      amountIn === 0n
    ) return;
    setOrderAction("approving");
    setOrderError(null);
    try {
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: payToken.address,
          data: encodeApprove(orderConfig.settlementAddress, MAX_APPROVAL),
          value: "0x0",
        }],
      }) as string;
      await waitForTransaction(hash);
      setSettlementAllowance(MAX_APPROVAL);
      setOrderAllowances((current) => ({
        ...current,
        [payToken.address!.toLowerCase()]: MAX_APPROVAL,
      }));
      await refreshTradingAccount(MAX_APPROVAL);
      setToast(`${paySymbol} approved. Your limit order is ready to sign.`);
      window.setTimeout(() => setToast(""), 3_200);
    } catch (error) {
      setOrderError(tradeError(error, "Token approval was not completed."));
    } finally {
      setOrderAction("idle");
    }
  }

  async function approveActiveOrder(order: LimitOrderRecord) {
    const provider = ethereumProvider();
    if (!provider || !address || !orderConfig?.settlementAddress) return;
    const inputSymbol = symbolForOrderToken(order.tokenIn, TOKEN_LIST) ?? "mUSDC";
    setOrderAction("approving");
    setOrderError(null);
    try {
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: order.tokenIn,
          data: encodeApprove(orderConfig.settlementAddress, MAX_APPROVAL),
          value: "0x0",
        }],
      }) as string;
      await waitForTransaction(hash);
      const tokenKey = order.tokenIn.toLowerCase();
      setOrderAllowances((current) => ({ ...current, [tokenKey]: MAX_APPROVAL }));
      if (payToken.address?.toLowerCase() === tokenKey) {
        setSettlementAllowance(MAX_APPROVAL);
      }
      setToast(`${inputSymbol} approved. The order is ready to fill.`);
      window.setTimeout(() => setToast(""), 3_200);
      window.setTimeout(() => void refreshOrders(), 3_500);
    } catch (error) {
      setOrderError(tradeError(error, "Token approval was not completed.", "orders"));
    } finally {
      setOrderAction("idle");
    }
  }

  async function submitLimitOrder() {
    const provider = ethereumProvider();
    if (!provider) {
      setOrderError({
        title: "Wallet not found",
        message: "Install or unlock a browser wallet, then reconnect to continue.",
        context: "ticket",
      });
      return;
    }
    if (!address) {
      setOrderError({
        title: "Wallet disconnected",
        message: "Reconnect your wallet before signing this order.",
        context: "ticket",
      });
      return;
    }
    if (!onGiwa) {
      setOrderError({
        title: "Switch network",
        message: "Switch your wallet to the supported network before signing this order.",
        context: "ticket",
      });
      return;
    }
    if (!pair.dataId || !payToken.address || !receiveToken.address) {
      setOrderError({
        title: "Market unavailable",
        message: "Limit orders are not enabled for this pair yet.",
        context: "ticket",
      });
      return;
    }
    if (!orderConfig?.enabled || !orderConfig.settlementAddress) {
      setOrderError({
        title: "Limit orders unavailable",
        message: "The settlement service is temporarily offline. Your funds remain in your wallet.",
        context: "ticket",
      });
      return;
    }
    if (amountIn === 0n || limitAmountOut === 0n) {
      setOrderError({
        title: "Review order details",
        message: "Enter a valid amount and limit price before continuing.",
        context: "ticket",
      });
      return;
    }

    setOrderAction("signing");
    setOrderError(null);
    try {
      const accounts = await provider.request({ method: "eth_accounts" }) as string[];
      if (!accounts.some((account) => account.toLowerCase() === address.toLowerCase())) {
        throw new Error("The connected wallet account changed. Reconnect and try again.");
      }
      const now = Math.floor(Date.now() / 1_000);
      const order: LimitOrderMessage = {
        maker: address as `0x${string}`,
        receiver: address as `0x${string}`,
        tokenIn: payToken.address,
        tokenOut: receiveToken.address,
        amountIn: amountIn.toString(),
        minAmountOut: limitAmountOut.toString(),
        validAfter: String(now),
        expiry: String(expiryTimestamp(expiry)),
        nonce: String(Date.now()),
        salt: randomOrderSalt(),
        maxFeeBps: "30",
      };
      const signature = await requestTypedDataSignature(
        provider,
        address,
        limitOrderTypedData(orderConfig, order),
      );
      setOrderAction("submitting");
      const created = await createLimitOrder({
        marketId: pair.dataId,
        side: side.toLowerCase() as "buy" | "sell",
        limitPrice,
        order,
        signature,
      });
      setReviewOpen(false);
      setAmount("");
      setOrderTab("Active");
      setOrders((current) => [
        created,
        ...current.filter((order) => order.orderHash !== created.orderHash),
      ]);
      setToast(`Limit order ${shortHash(created.orderHash)} is active.`);
      window.setTimeout(() => setToast(""), 3_200);
    } catch (error) {
      setOrderError(tradeError(error, "The limit order was not created."));
    } finally {
      setOrderAction("idle");
    }
  }

  async function cancelOrder(order: LimitOrderRecord) {
    const provider = ethereumProvider();
    if (!provider || !address || !orderConfig?.settlementAddress) return;
    setOrderAction("cancelling");
    setOrderError(null);
    try {
      const deadline = String(Math.floor(Date.now() / 1_000) + 5 * 60);
      const signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [
          address,
          JSON.stringify(cancellationTypedData(orderConfig, order, deadline)),
        ],
      }) as string;
      await cancelLimitOrder(order, deadline, signature);
      setToast(`Order ${shortHash(order.orderHash)} cancelled.`);
      window.setTimeout(() => setToast(""), 3_200);
      await refreshOrders();
    } catch (error) {
      setOrderError(tradeError(error, "The order could not be cancelled."));
    } finally {
      setOrderAction("idle");
    }
  }

  async function cancelOrderOnchain(order: LimitOrderRecord) {
    const provider = ethereumProvider();
    if (!provider || !address || !orderConfig?.settlementAddress) return;
    setOrderAction("cancelling");
    setOrderError(null);
    try {
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: orderConfig.settlementAddress,
          data: encodeOnchainCancellation(order),
          value: "0x0",
        }],
      }) as string;
      await waitForTransaction(hash);
      setToast(`Cancellation secured onchain: ${shortHash(hash)}.`);
      window.setTimeout(() => setToast(""), 3_200);
      window.setTimeout(() => void refreshOrders(), 5_000);
    } catch (error) {
      setOrderError(tradeError(error, "The onchain cancellation was not completed."));
    } finally {
      setOrderAction("idle");
    }
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
    if (mode === "Market") {
      if (!marketQuotable || !hasAmount || insufficientBalance) return;
      if (marketSwap.stage !== "idle" || !marketSwap.quote) return;
      if (marketSwap.needsApproval) {
        void marketSwap.onApprove();
        return;
      }
      // The ticket reads its own balance, so it has to be re-read once the swap has settled --
      // the hook only refreshes the figures it owns.
      void marketSwap.onSwap().then(() => refreshTradingAccount());
      return;
    }
    if (!hasAmount || !marketDataAvailable) return;
    if (needsSettlementApproval) {
      void approveSettlement();
      return;
    }
    setOrderError(null);
    setReviewOpen(true);
  }

  const marketActionLabel = !marketQuotable
    ? "Market setup pending"
    : !hasAmount
      ? `Enter amount to ${side.toLowerCase()} ${pair.base}`
    : insufficientBalance
      ? `Not enough ${paySymbol}`
    : marketSwap.stage === "quoting"
      ? `Finding best ${side.toLowerCase()} route…`
    : !marketSwap.quote
      ? marketSwap.quoteError
        ? "No route"
        : `Enter amount to ${side.toLowerCase()} ${pair.base}`
    : marketSwap.needsApproval
      ? marketSwap.stage === "approving" ? "Approving…" : `Approve ${paySymbol}`
    : marketSwap.stage === "swapping"
      ? `Confirm ${side.toLowerCase()} in wallet…`
      : `${side} ${pair.base}`;
  const actionLabel = !connected
    ? "Connect wallet"
    : !onGiwa
      ? "Switch network"
      : mode === "Market"
        ? marketActionLabel
      : orderConfig === null
        ? "Loading limit orders"
      : !orderConfig.enabled
        ? "Limit orders unavailable"
      : orderAction === "approving"
        ? `Approving ${paySymbol}…`
      : orderAction === "signing"
        ? "Confirm order signature…"
      : orderAction === "submitting"
        ? "Submitting order…"
      : marketLoading
        ? "Loading market data"
      : !marketDataAvailable
        ? "Market data pending"
      : !hasAmount
        ? `Enter amount to ${side.toLowerCase()} ${pair.base}`
      : limitAmountOut === 0n
        ? `Enter a valid ${side.toLowerCase()} price`
      : insufficientBalance
        ? `Not enough ${paySymbol}`
      : needsSettlementApproval
        ? `Approve ${paySymbol}`
        : `Review ${side.toLowerCase()} order`;
  const actionDisabled = orderAction !== "idle" || (
    connected &&
    onGiwa &&
    (mode === "Limit"
      ? (
        orderConfig === null ||
        !orderConfig.enabled ||
        !hasAmount ||
        !marketDataAvailable ||
        limitAmountOut === 0n ||
        insufficientBalance
      )
      : (
        !marketQuotable ||
        !hasAmount ||
        insufficientBalance ||
        marketSwap.stage !== "idle" ||
        !marketSwap.quote
      ))
  );
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
                  <span><strong>{pairKey}</strong><small>Spot market</small></span>
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
              <button
                type="button"
                aria-label="Refresh orders"
                onClick={() => void refreshOrders()}
                disabled={ordersLoading || !connected}
              >
                {ordersLoading ? "…" : "↻"}
              </button>
            </div>
            <div className="terminal-order-columns" aria-hidden="true">
              <span>Pair / type</span><span>Amount</span><span>Price</span><span>Status</span>
            </div>
            {orderError?.context === "orders" && (
              <TradeErrorAlert
                error={orderError}
                className="in-orders"
                onDismiss={() => setOrderError(null)}
              />
            )}
            {orders.length > 0 ? (
              <div className="terminal-order-list">
                {orders.map((order) => {
                  const inputSymbol = symbolForOrderToken(order.tokenIn, TOKEN_LIST) ?? paySymbol;
                  const outputSymbol = symbolForOrderToken(order.tokenOut, TOKEN_LIST) ?? receiveSymbol;
                  const inputToken = TOKENS[inputSymbol];
                  const listedPair = (Object.entries(pairs) as Array<
                    [PairKey, (typeof pairs)[PairKey]]
                  >).find(([, value]) => value.dataId === order.marketId)?.[0]
                    ?? `${outputSymbol}/${inputSymbol}`;
                  const listedQuote = listedPair.split("/")[1] ?? inputSymbol;
                  const inputAmount = fromBaseUnits(
                    BigInt(order.actualAmountIn ?? order.amountIn),
                    inputToken.decimals,
                    6,
                  );
                  const activeOrderAllowance = orderAllowances[order.tokenIn.toLowerCase()];
                  const approvalRequired = orderTab === "Active"
                    && order.status === "open"
                    && activeOrderAllowance !== undefined
                    && activeOrderAllowance < BigInt(order.amountIn);
                  const transactionHash = order.fillTxHash ?? order.executionTxHash;
                  return (
                    <div
                      className={`terminal-order-row ${
                        fillNotice?.orderHash === order.orderHash ? "just-filled" : ""
                      }`}
                      key={order.id}
                    >
                      <div>
                        <span className={`terminal-order-side ${order.side}`}>
                          {order.side === "buy" ? "Buy" : "Sell"}
                        </span>
                        <p>
                          <strong>{listedPair}</strong>
                          <small>{new Date(order.createdAt).toLocaleString()}</small>
                        </p>
                      </div>
                      <span>{inputAmount} {inputSymbol}</span>
                      <span>{formatPrice(Number(order.limitPrice))} {listedQuote}</span>
                      <div className="terminal-order-status">
                        <span className={approvalRequired ? "status-approval" : `status-${order.status}`}>
                          {approvalRequired ? "Approval required" : order.status}
                        </span>
                        {orderTab === "Active" && (
                          <div className="terminal-order-actions">
                            {approvalRequired ? (
                              <button
                                className="approve"
                                type="button"
                                disabled={orderAction !== "idle"}
                                title={`Approve ${inputSymbol} so this order can fill`}
                                onClick={() => void approveActiveOrder(order)}
                              >
                                Approve
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={orderAction !== "idle" || order.status !== "open"}
                                onClick={() => void cancelOrder(order)}
                              >
                                {order.status === "executing" ? "Executing" : "Cancel"}
                              </button>
                            )}
                          </div>
                        )}
                        {orderTab === "History" && transactionHash && (
                          <a href={`${EXPLORER}/tx/${transactionHash}`} target="_blank" rel="noreferrer">
                            ↗
                          </a>
                        )}
                        {orderTab === "History" &&
                          order.status === "cancelled" &&
                          !order.cancelTxHash &&
                          orderConfig?.settlementAddress && (
                            <button
                              type="button"
                              disabled={orderAction !== "idle"}
                              onClick={() => void cancelOrderOnchain(order)}
                              title="Record cancellation onchain"
                            >
                              Secure
                            </button>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="terminal-orders-empty">
                <span>⌁</span>
                <strong>{orderTab === "Active" ? "No active orders" : "No order history"}</strong>
                <p>{connected ? "Your orders will appear here." : "Connect your wallet to view your orders."}</p>
              </div>
            )}
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
            <div>
              <span>{side === "Buy" ? "You pay" : "You sell"}</span>
              <small>
                Balance {connected
                  ? fromBaseUnits(payBalance, payToken.decimals, 5)
                  : "—"}
              </small>
            </div>
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
            <div>
              <span>{side === "Buy" ? "You buy" : "You receive"}</span>
              <small>
                {mode === "Market" && marketSwap.quote
                  ? `Live ${side.toLowerCase()} quote`
                  : `Estimated ${side.toLowerCase()}`}
              </small>
            </div>
            <label>
              <strong>{receiveDisplay}</strong>
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
            <div>
              <dt>Execution condition</dt>
              <dd>
                {mode === "Limit"
                  ? side === "Buy"
                    ? `Buy at ${limitPrice || "—"} ${pair.quote} or lower`
                    : `Sell at ${limitPrice || "—"} ${pair.quote} or higher`
                  : `Best available ${side.toLowerCase()} route`}
              </dd>
            </div>
            <div>
              <dt>{mode === "Limit" ? "Order fee cap" : "Minimum receive"}</dt>
              <dd>
                {mode === "Limit"
                  ? "0.30%"
                  : marketSwap.quote
                    ? `${fromBaseUnits(BigInt(marketSwap.quote.minAmountOut), receiveToken.decimals, 6)} ${receiveSymbol}`
                    : "—"}
              </dd>
            </div>
          </dl>

          {orderError?.context === "ticket" && !reviewOpen && (
            <TradeErrorAlert
              error={orderError}
              onDismiss={() => setOrderError(null)}
            />
          )}
          {mode === "Market" && (marketSwap.error ?? marketSwap.quoteError) && (
            <div className="terminal-ticket-error">
              {marketSwap.error ?? marketSwap.quoteError}
            </div>
          )}
          <button className="app-primary-button terminal-order-action" type="button" disabled={actionDisabled} onClick={handlePrimaryAction}>
            {actionLabel}
          </button>
        </Panel>
      </div>

      {reviewOpen && (
        <div className="app-modal-backdrop" role="presentation">
          <div className="app-modal trade-review-modal" role="dialog" aria-modal="true" aria-labelledby="advanced-review-title">
            <button className="app-modal-close" type="button" aria-label="Close order review" onClick={() => setReviewOpen(false)}>×</button>
            <span className="terminal-review-eyebrow">{mode} {side.toLowerCase()} order</span>
            <h2 id="advanced-review-title">Review {side.toLowerCase()} order</h2>
            <div className="terminal-review-pair"><TokenIcon symbol={pair.base} /><TokenIcon symbol={pair.quote} /><strong>{pairKey}</strong><span>{side}</span></div>
            <dl className="review-details">
              <div><dt>{side === "Buy" ? "You pay" : "You sell"}</dt><dd>{amount} {paySymbol}</dd></div>
              <div><dt>Minimum receive</dt><dd>≥ {limitReceiveAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {receiveSymbol}</dd></div>
              <div><dt>Execution</dt><dd>{mode === "Market" ? "Best available price" : `${formatPrice(executionPrice)} ${pair.quote}`}</dd></div>
              {mode === "Limit" && <div><dt>Expiry</dt><dd>{expiry}</dd></div>}
            </dl>
            {orderAction === "signing" && (
              <div className="terminal-signing-status" role="status">
                <span />
                <div>
                  <strong>Waiting for your signature</strong>
                  <p>Open your wallet extension and approve the typed-data request.</p>
                </div>
              </div>
            )}
            {orderAction === "submitting" && (
              <div className="terminal-signing-status success" role="status">
                <span>✓</span>
                <div>
                  <strong>Signature approved</strong>
                  <p>Saving your order and starting price monitoring.</p>
                </div>
              </div>
            )}
            {orderError?.context === "ticket" && (
              <TradeErrorAlert
                error={orderError}
                className="modal-error"
                onDismiss={() => setOrderError(null)}
              />
            )}
            <button
              className="app-primary-button"
              type="button"
              disabled={orderAction !== "idle"}
              onClick={() => void submitLimitOrder()}
            >
              {orderAction === "signing"
                ? "Waiting for wallet…"
                : orderAction === "submitting"
                  ? "Saving order…"
                  : `Sign ${side.toLowerCase()} order`}
            </button>
          </div>
        </div>
      )}

      {fillNotice && (
        <aside
          className="limit-fill-notice"
          role="status"
          aria-live="assertive"
          aria-label="Limit order filled"
        >
          <div className="limit-fill-icon" aria-hidden="true">
            <i />
            <span>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M6.5 12.4 10.2 16l7.5-8" />
              </svg>
            </span>
          </div>
          <div className="limit-fill-content">
            <span className="limit-fill-eyebrow">Limit order filled</span>
            <strong>{fillNotice.pair}</strong>
            <p>
              {fillNotice.side === "buy" ? "Bought" : "Sold"} at{" "}
              {formatPrice(fillNotice.executionPrice)} mUSDC
            </p>
            <div>
              <span>Received</span>
              <b>{fillNotice.received} {fillNotice.receivedSymbol}</b>
            </div>
            {fillNotice.transactionHash && (
              <a
                href={`${EXPLORER}/tx/${fillNotice.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction <span>↗</span>
              </a>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss fill notification"
            onClick={() => setFillNotice(null)}
          >
            ×
          </button>
        </aside>
      )}

      {marketSwap.transaction && (
        <TransactionStatusModal
          transaction={marketSwap.transaction}
          onClose={() => marketSwap.setTransaction(null)}
          backLabel="Back to trade"
        />
      )}

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
