import { createServer } from "node:http";
import { MARKET_BY_ID, SUPPORTED_INTERVALS } from "../config/markets.mjs";

function sendJson(response, status, payload, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  });
  response.end(JSON.stringify(payload));
}

function resolveCorsOrigin(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return allowedOrigins[0] ?? "*";
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? "null";
}

export function createMarketHttpServer({
  marketDataService,
  liveIndexer,
  backfillService,
  corsOrigins,
  logger = console,
}) {
  return createServer(async (request, response) => {
    const origin = resolveCorsOrigin(request, corsOrigins);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
      });
      response.end();
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          database: "connected",
          indexer: liveIndexer.status,
          backfill: backfillService.running ? "running" : "idle",
          timestamp: Date.now(),
        }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/markets") {
        sendJson(response, 200, { markets: await marketDataService.getMarkets() }, origin);
        return;
      }

      const snapshotMatch = url.pathname.match(/^\/api\/markets\/([^/]+)\/snapshot$/);
      if (request.method === "GET" && snapshotMatch) {
        const marketId = decodeURIComponent(snapshotMatch[1]);
        const interval = url.searchParams.get("interval") ?? "15m";
        const requestedLimit = Number(url.searchParams.get("limit") ?? 720);
        const limit = Math.min(2000, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 720));
        if (!MARKET_BY_ID.has(marketId)) {
          sendJson(response, 404, { error: "Market not found" }, origin);
          return;
        }
        if (!Object.hasOwn(SUPPORTED_INTERVALS, interval)) {
          sendJson(response, 400, { error: "Unsupported interval" }, origin);
          return;
        }
        const snapshot = await marketDataService.getSnapshot(marketId, interval, limit);
        sendJson(response, 200, snapshot, origin);
        return;
      }

      sendJson(response, 404, { error: "Not found" }, origin);
    } catch (error) {
      logger.error("[api] request failed", error);
      sendJson(response, 500, { error: "Internal server error" }, origin);
    }
  });
}
