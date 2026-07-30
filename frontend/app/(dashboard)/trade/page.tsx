"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  Toast,
  TokenIcon,
  useAppWallet,
} from "@/app/components/AppShell";
import {
  EXPLORER,
  MARKETS,
  TOKENS,
  TOKEN_LIST,
  allowance,
  balanceOf,
  encodeApprove,
  fromBaseUnits,
  toBaseUnits,
  type TokenSymbol,
} from "@/app/lib/dubu";
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
  const [orderError, setOrderError] = useState("");
  const [orderAction, setOrderAction] = useState<OrderActionState>("idle");
  const [payBalance, setPayBalance] = useState(0n);
  const [settlementAllowance, setSettlementAllowance] = useState(0n);
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
  const paySymbol = side === "Buy" ? pair.quote : pair.base;
  const receiveSymbol = side === "Buy" ? pair.base : pair.quote;
  const payToken = TOKENS[paySymbol];
  const receiveToken = TOKENS[receiveSymbol];
  const amountIn = toBaseUnits(amount, payToken.decimals);
  const executionPrice = mode === "Limit"
    ? Number.parseFloat(limitPrice) || currentPrice || 0
    : currentPrice || 0;
  const estimatedMarketReceive = hasAmount && executionPrice > 0
    ? side === "Buy"
      ? numericAmount / executionPrice
      : numericAmount * executionPrice
    : 0;
  const limitAmountOut = calculateLimitOutput({
    side,
    amountIn,
    inputDecimals: payToken.decimals,
    outputDecimals: receiveToken.decimals,
    limitPrice,
  });
  const receiveAmount = mode === "Limit"
    ? Number(fromBaseUnits(limitAmountOut, receiveToken.decimals, 8).replace(/,/g, ""))
    : estimatedMarketReceive;
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

  const refreshOrders = useCallback(async () => {
    if (!address) {
      setOrders([]);
      return;
    }
    const controller = new AbortController();
    setOrdersLoading(true);
    try {
      const nextOrders = await fetchLimitOrders(
        address,
        orderTab === "Active" ? "active" : "history",
        controller.signal,
      );
      setOrders(nextOrders);
      setOrderError("");
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Orders could not be loaded.");
    } finally {
      setOrdersLoading(false);
    }
  }, [address, orderTab]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    if (!address) return;
    return subscribeToOrders(address, () => void refreshOrders());
  }, [address, refreshOrders]);

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
    setOrderError("");
    try {
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: payToken.address,
          data: encodeApprove(orderConfig.settlementAddress, amountIn),
          value: "0x0",
        }],
      }) as string;
      await waitForTransaction(hash);
      setSettlementAllowance((current) => current >= amountIn ? current : amountIn);
      await refreshTradingAccount(amountIn);
      setToast(`${paySymbol} approved. Your limit order is ready to sign.`);
      window.setTimeout(() => setToast(""), 3_200);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Token approval was not completed.");
    } finally {
      setOrderAction("idle");
    }
  }

  async function submitLimitOrder() {
    const provider = ethereumProvider();
    if (
      !provider ||
      !address ||
      !pair.dataId ||
      !payToken.address ||
      !receiveToken.address ||
      !orderConfig?.enabled ||
      !orderConfig.settlementAddress ||
      amountIn === 0n ||
      limitAmountOut === 0n
    ) return;

    setOrderAction("signing");
    setOrderError("");
    try {
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
      const signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify(limitOrderTypedData(orderConfig, order))],
      }) as string;
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
      setToast(`Limit order ${shortHash(created.orderHash)} is active.`);
      window.setTimeout(() => setToast(""), 3_200);
      await refreshOrders();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Limit order was not created.");
    } finally {
      setOrderAction("idle");
    }
  }

  async function cancelOrder(order: LimitOrderRecord) {
    const provider = ethereumProvider();
    if (!provider || !address || !orderConfig?.settlementAddress) return;
    setOrderAction("cancelling");
    setOrderError("");
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
      setOrderError(error instanceof Error ? error.message : "Order could not be cancelled.");
    } finally {
      setOrderAction("idle");
    }
  }

  async function cancelOrderOnchain(order: LimitOrderRecord) {
    const provider = ethereumProvider();
    if (!provider || !address || !orderConfig?.settlementAddress) return;
    setOrderAction("cancelling");
    setOrderError("");
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
      setOrderError(error instanceof Error ? error.message : "Onchain cancellation failed.");
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
      const query = new URLSearchParams({
        from: paySymbol,
        to: receiveSymbol,
        amount,
      });
      window.location.assign(`/swap?${query}`);
      return;
    }
    if (!hasAmount || !marketDataAvailable) return;
    if (needsSettlementApproval) {
      void approveSettlement();
      return;
    }
    setReviewOpen(true);
  }

  const actionLabel = !connected
    ? "Connect wallet"
    : !onGiwa
      ? "Switch network"
      : mode === "Market"
        ? "Open market swap"
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
        ? "Enter an amount"
      : limitAmountOut === 0n
        ? "Enter a valid limit price"
      : insufficientBalance
        ? `Not enough ${paySymbol}`
      : needsSettlementApproval
        ? `Approve ${paySymbol}`
        : "Review limit order";
  const actionDisabled = orderAction !== "idle" || (
    mode === "Limit" &&
    connected &&
    onGiwa &&
    (
      orderConfig === null ||
      !orderConfig.enabled ||
      !hasAmount ||
      !marketDataAvailable ||
      limitAmountOut === 0n ||
      insufficientBalance
    )
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
            {orderError && <div className="terminal-order-error">{orderError}</div>}
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
                  const transactionHash = order.fillTxHash ?? order.executionTxHash;
                  return (
                    <div className="terminal-order-row" key={order.id}>
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
                        <span className={`status-${order.status}`}>{order.status}</span>
                        {orderTab === "Active" && (
                          <button
                            type="button"
                            disabled={orderAction !== "idle" || order.status !== "open"}
                            onClick={() => void cancelOrder(order)}
                          >
                            {order.status === "executing" ? "Executing" : "Cancel"}
                          </button>
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
              <span>You pay</span>
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
            <div><dt>Execution condition</dt><dd>{mode === "Limit" ? `At ${limitPrice || "—"} ${pair.quote}` : "Best available route"}</dd></div>
            <div><dt>Order fee cap</dt><dd>{mode === "Limit" ? "0.30%" : "Shown in Swap"}</dd></div>
          </dl>

          {orderError && <div className="terminal-ticket-error">{orderError}</div>}
          <button className="app-primary-button terminal-order-action" type="button" disabled={actionDisabled} onClick={handlePrimaryAction}>
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
              <div><dt>Minimum receive</dt><dd>≥ {receiveAmount.toLocaleString("en-US", { maximumFractionDigits: 6 })} {receiveSymbol}</dd></div>
              <div><dt>Execution</dt><dd>{mode === "Market" ? "Best available price" : `${formatPrice(executionPrice)} ${pair.quote}`}</dd></div>
              {mode === "Limit" && <div><dt>Expiry</dt><dd>{expiry}</dd></div>}
            </dl>
            <button
              className="app-primary-button"
              type="button"
              disabled={orderAction !== "idle"}
              onClick={() => void submitLimitOrder()}
            >
              {orderAction === "signing"
                ? "Confirm in wallet…"
                : orderAction === "submitting"
                  ? "Submitting…"
                  : "Sign limit order"}
            </button>
          </div>
        </div>
      )}

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}
