export type StoredCandle = [
  openTime: number,
  closeTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  baseVolume: number,
  quoteVolume: number,
  tradeCount: number,
];

export type MarketCandle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  baseVolume: number;
  quoteVolume: number;
  tradeCount: number;
};

export type MarketTicker = {
  lastPrice: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  baseVolume24h: number;
  quoteVolume24h: number;
  sourceTimestamp: number;
};

export type MarketSnapshot = {
  source: string;
  generatedAt: number;
  ticker: MarketTicker | null;
  candles: StoredCandle[];
};

export type MarketStreamStatus = "connecting" | "live" | "reconnecting";

type MarketStreamEvent =
  | { type: "connected"; marketId: string }
  | { type: "ticker"; marketId: string; data: MarketTicker }
  | { type: "candle"; marketId: string; interval: string; data: MarketCandle };

const MARKET_DATA_URL = (
  process.env.NEXT_PUBLIC_MARKET_DATA_URL ?? "http://localhost:4100"
).replace(/\/+$/, "");

function marketWebSocketUrl(marketId: string) {
  const url = new URL(MARKET_DATA_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.searchParams.set("marketId", marketId);
  return url.toString();
}

export async function fetchMarketSnapshot(
  marketId: string,
  interval: string,
  signal: AbortSignal,
) {
  const url = new URL(`${MARKET_DATA_URL}/api/markets/${encodeURIComponent(marketId)}/snapshot`);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", "720");
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Market data returned ${response.status}`);
  return response.json() as Promise<MarketSnapshot>;
}

export function subscribeToMarket({
  marketId,
  onStatus,
  onTicker,
  onCandle,
}: {
  marketId: string;
  onStatus: (status: MarketStreamStatus) => void;
  onTicker: (ticker: MarketTicker) => void;
  onCandle: (interval: string, candle: MarketCandle) => void;
}) {
  let active = true;
  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;

  function connect() {
    if (!active) return;
    onStatus(reconnectAttempt === 0 ? "connecting" : "reconnecting");
    socket = new WebSocket(marketWebSocketUrl(marketId));

    socket.addEventListener("open", () => {
      if (!active) return;
      reconnectAttempt = 0;
      onStatus("live");
    });

    socket.addEventListener("message", (event) => {
      if (!active) return;
      try {
        const message = JSON.parse(String(event.data)) as MarketStreamEvent;
        if (message.marketId !== marketId) return;
        if (message.type === "ticker") onTicker(message.data);
        if (message.type === "candle") onCandle(message.interval, message.data);
      } catch {
        // Keep the most recent valid market state when a malformed frame arrives.
      }
    });

    socket.addEventListener("close", () => {
      if (!active) return;
      reconnectAttempt += 1;
      onStatus("reconnecting");
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt - 1, 5));
      reconnectTimer = window.setTimeout(connect, delay);
    });

    socket.addEventListener("error", () => socket?.close());
  }

  connect();
  return () => {
    active = false;
    window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}
