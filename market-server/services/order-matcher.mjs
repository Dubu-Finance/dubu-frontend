export class OrderMatcher {
  constructor({
    repository,
    orderService,
    executionService,
    pollMs = 3_000,
    batchSize = 20,
    logger = console,
  }) {
    this.repository = repository;
    this.orderService = orderService;
    this.executionService = executionService;
    this.pollMs = pollMs;
    this.batchSize = batchSize;
    this.logger = logger;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref?.();
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running || !this.orderService.enabled) return;
    this.running = true;
    try {
      await this.orderService.expireOrders();
      await this.repository.recoverStaleExecutingOrders();
      const orders = await this.repository.claimOpenOrders(this.batchSize);
      for (const order of orders) {
        await this.executionService.execute(order);
      }
    } catch (error) {
      this.logger.error("[limit-orders] matcher tick failed", error);
    } finally {
      this.running = false;
    }
  }
}
