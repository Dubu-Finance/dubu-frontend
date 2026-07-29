import { BASE_INTERVAL, BASE_INTERVAL_MS } from "../config/markets.mjs";

const PAGE_LIMIT = 1000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Dubu-Market-Server/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response.json();

    if (
      (response.status === 418 || response.status === 429 || response.status >= 500)
      && attempt < 5
    ) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(8000, 500 * 2 ** (attempt - 1));
      await sleep(delay);
      return fetchJson(url, attempt + 1);
    }

    const body = await response.text();
    throw new Error(`Binance request failed (${response.status}): ${body.slice(0, 240)}`);
  } catch (error) {
    if (attempt >= 5) throw error;
    await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
    return fetchJson(url, attempt + 1);
  }
}

export async function fetchBinanceCandles({
  restUrl,
  providerSymbol,
  rangeStart,
  rangeEnd,
}) {
  const candles = [];
  let cursor = rangeStart;

  while (cursor <= rangeEnd) {
    const url = new URL("/api/v3/klines", restUrl);
    url.searchParams.set("symbol", providerSymbol);
    url.searchParams.set("interval", BASE_INTERVAL);
    url.searchParams.set("startTime", String(cursor));
    url.searchParams.set("endTime", String(rangeEnd));
    url.searchParams.set("limit", String(PAGE_LIMIT));

    const page = await fetchJson(url);
    if (!Array.isArray(page) || page.length === 0) break;

    for (const item of page) {
      const openTime = Number(item[0]);
      const closeTime = Number(item[6]);
      if (openTime < rangeStart || openTime > rangeEnd || closeTime > rangeEnd + BASE_INTERVAL_MS) {
        continue;
      }
      candles.push({
        openTime,
        closeTime,
        open: String(item[1]),
        high: String(item[2]),
        low: String(item[3]),
        close: String(item[4]),
        baseVolume: String(item[5]),
        quoteVolume: String(item[7]),
        tradeCount: Number(item[8]),
      });
    }

    const lastOpenTime = Number(page.at(-1)?.[0]);
    if (!Number.isFinite(lastOpenTime) || lastOpenTime < cursor || page.length < PAGE_LIMIT) break;
    cursor = lastOpenTime + BASE_INTERVAL_MS;
    await sleep(120);
  }

  return candles;
}
