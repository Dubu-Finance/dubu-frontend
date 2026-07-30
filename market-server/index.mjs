import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "./config/runtime.mjs";
import { MARKETS } from "./config/markets.mjs";
import { createMarketPool, withTransaction } from "./database/client.mjs";
import { MarketRepository, upsertMarkets } from "./database/market-repository.mjs";
import { OrderRepository } from "./database/order-repository.mjs";
import { BackfillService } from "./services/backfill-service.mjs";
import { LiveIndexer } from "./services/live-indexer.mjs";
import { MarketDataService } from "./services/market-data-service.mjs";
import { OrderService } from "./services/order-service.mjs";
import { OrderExecutionService } from "./services/order-execution-service.mjs";
import { OrderMatcher } from "./services/order-matcher.mjs";
import { OrderEventIndexer } from "./services/order-event-indexer.mjs";
import { createMarketHttpServer } from "./transport/http-server.mjs";
import { WebSocketHub } from "./transport/websocket-hub.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

async function start() {
  const config = loadRuntimeConfig();
  const pool = createMarketPool({ connectionString: config.databaseUrl });
  const schema = await readFile(resolve(MODULE_DIR, "../db/market-data.postgres.sql"), "utf8");
  await pool.query(schema);
  await withTransaction(pool, (client) => upsertMarkets(client, MARKETS));

  const repository = new MarketRepository(pool);
  const orderRepository = new OrderRepository(pool);
  const hub = new WebSocketHub({ allowedOrigins: config.corsOrigins });
  const marketDataService = new MarketDataService(repository);
  const backfillService = new BackfillService({
    pool,
    repository,
    markets: MARKETS,
    restUrl: config.binanceRestUrl,
  });
  const liveIndexer = new LiveIndexer({
    repository,
    hub,
    markets: MARKETS,
    webSocketUrl: config.binanceWebSocketUrl,
  });
  const orderService = new OrderService({
    repository: orderRepository,
    hub,
    settlementAddress: config.limitOrderSettlementAddress,
    executorConfigured: Boolean(config.limitOrderExecutorPrivateKey),
  });
  const orderExecutionService = new OrderExecutionService({
    repository: orderRepository,
    hub,
    rpcUrl: config.giwaRpcUrl,
    aggregatorUrl: config.aggregatorUrl,
    settlementAddress: config.limitOrderSettlementAddress,
    executorPrivateKey: config.limitOrderExecutorPrivateKey,
    allowRfq: config.limitOrderAllowRfq,
    confirmations: config.limitOrderConfirmations,
  });
  const orderMatcher = new OrderMatcher({
    repository: orderRepository,
    orderService,
    executionService: orderExecutionService,
    pollMs: config.limitOrderPollMs,
    batchSize: config.limitOrderBatchSize,
  });
  const orderEventIndexer = new OrderEventIndexer({
    repository: orderRepository,
    hub,
    rpcUrl: config.giwaRpcUrl,
    settlementAddress: config.limitOrderSettlementAddress,
    confirmations: config.limitOrderConfirmations,
    startBlock: config.limitOrderStartBlock,
  });
  const httpServer = createMarketHttpServer({
    marketDataService,
    liveIndexer,
    backfillService,
    orderService,
    corsOrigins: config.corsOrigins,
  });
  hub.attach(httpServer);

  httpServer.listen(config.port, config.host, () => {
    console.info(`[market-server] http://localhost:${config.port}`);
    liveIndexer.start();
    orderMatcher.start();
    orderEventIndexer.start();
    if (config.backfillOnStart) {
      void backfillService.run({ days: config.backfillDays, incremental: true }).catch((error) => {
        console.error("[backfill] startup catch-up failed", error);
      });
    }
  });

  async function shutdown(signal) {
    console.info(`[market-server] received ${signal}`);
    liveIndexer.stop();
    orderMatcher.stop();
    orderEventIndexer.stop();
    hub.close();
    await new Promise((resolveClose) => httpServer.close(resolveClose));
    await pool.end();
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("[market-server] failed to start", error);
  process.exitCode = 1;
});
