import { createServer } from "node:http";
import { MARKET_BY_ID, SUPPORTED_INTERVALS } from "../config/markets.mjs";
import { resolveCorsOrigin } from "./origin.mjs";

function sendJson(response, status, payload, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, maxBytes = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

export function createMarketHttpServer({
  marketDataService,
  liveIndexer,
  backfillService,
  orderService,
  corsOrigins,
  logger = console,
}) {
  return createServer(async (request, response) => {
    const origin = resolveCorsOrigin(request, corsOrigins);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
          limitOrders: orderService.enabled ? "active" : "disabled",
          timestamp: Date.now(),
        }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/markets") {
        sendJson(response, 200, { markets: await marketDataService.getMarkets() }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/orders/config") {
        sendJson(response, 200, orderService.getConfig(), origin);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/orders") {
        const body = await readJsonBody(request);
        const order = await orderService.createOrder(body);
        sendJson(response, 201, { order }, origin);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/orders") {
        const maker = url.searchParams.get("maker") ?? "";
        const status = url.searchParams.get("status") ?? "all";
        const limit = Number(url.searchParams.get("limit") ?? 100);
        const orders = await orderService.listOrders({ maker, status, limit });
        sendJson(response, 200, { orders }, origin);
        return;
      }

      const cancelOrderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
      if (request.method === "POST" && cancelOrderMatch) {
        const identifier = decodeURIComponent(cancelOrderMatch[1]);
        const body = await readJsonBody(request);
        const order = await orderService.cancelOrder(identifier, body);
        sendJson(response, 200, { order }, origin);
        return;
      }

      const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
      if (request.method === "GET" && orderMatch) {
        const order = await orderService.getOrder(decodeURIComponent(orderMatch[1]));
        if (!order) {
          sendJson(response, 404, { error: "Order not found" }, origin);
          return;
        }
        sendJson(response, 200, { order }, origin);
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
      const status = Number(error?.statusCode) || (
        error instanceof Error && /must|required|unsupported|invalid|expiry|signature|token/i.test(error.message)
          ? 400
          : 500
      );
      sendJson(
        response,
        status,
        { error: status >= 500 ? "Internal server error" : error.message },
        origin,
      );
    }
  });
}
