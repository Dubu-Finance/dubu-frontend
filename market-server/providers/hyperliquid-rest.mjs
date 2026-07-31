import { BASE_INTERVAL, BASE_INTERVAL_MS } from "../config/markets.mjs";
import { normalizeHyperliquidCandle } from "./hyperliquid-candle.mjs";

// The info endpoint answers a candle snapshot in one page and caps it somewhere just past
// 5,000 rows, so the loop below pages forward rather than trusting a single response. It also
// means a 5-minute history only reaches about 17 days back no matter how wide the range is --
// Hyperliquid keeps roughly the last 5,000 buckets per interval and drops the rest.
const PAGE_LIMIT = 5000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postInfo(infoUrl, body, attempt = 1) {
  try {
    const response = await fetch(infoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Dubu-Market-Server/1.0",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response.json();

    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(8000, 500 * 2 ** (attempt - 1));
      await sleep(delay);
      return postInfo(infoUrl, body, attempt + 1);
    }

    const text = await response.text();
    throw new Error(`Hyperliquid request failed (${response.status}): ${text.slice(0, 240)}`);
  } catch (error) {
    if (attempt >= 5) throw error;
    await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
    return postInfo(infoUrl, body, attempt + 1);
  }
}

export async function fetchHyperliquidCandles({
  infoUrl,
  providerSymbol,
  rangeStart,
  rangeEnd,
}) {
  const candles = [];
  let cursor = rangeStart;

  while (cursor <= rangeEnd) {
    const page = await postInfo(infoUrl, {
      type: "candleSnapshot",
      req: {
        coin: providerSymbol,
        interval: BASE_INTERVAL,
        startTime: cursor,
        endTime: rangeEnd,
      },
    });
    if (!Array.isArray(page) || page.length === 0) break;

    for (const item of page) {
      const candle = normalizeHyperliquidCandle(item);
      if (!candle) continue;
      if (candle.openTime < rangeStart || candle.openTime > rangeEnd) continue;
      candles.push(candle);
    }

    const lastOpenTime = Number(page.at(-1)?.t);
    if (!Number.isFinite(lastOpenTime) || lastOpenTime < cursor) break;
    cursor = lastOpenTime + BASE_INTERVAL_MS;
    if (page.length < PAGE_LIMIT) break;
    await sleep(120);
  }

  return candles;
}
