import { Interface, JsonRpcProvider, isAddress } from "ethers";
import { GIWA_CHAIN_ID } from "../config/chain.mjs";
import { SETTLEMENT_ABI } from "./order-execution-service.mjs";

export class OrderEventIndexer {
  constructor({
    repository,
    hub,
    rpcUrl,
    settlementAddress,
    pollMs = 5_000,
    confirmations = 2,
    startBlock = null,
    logger = console,
  }) {
    this.repository = repository;
    this.hub = hub;
    this.settlementAddress = settlementAddress;
    this.pollMs = pollMs;
    this.confirmations = confirmations;
    this.startBlock = startBlock;
    this.logger = logger;
    this.enabled = isAddress(settlementAddress);
    this.interface = new Interface(SETTLEMENT_ABI);
    this.provider = this.enabled ? new JsonRpcProvider(rpcUrl) : null;
    this.timer = null;
    this.running = false;
    this.serviceKey = this.enabled
      ? `limit-orders:${GIWA_CHAIN_ID}:${settlementAddress.toLowerCase()}`
      : "";
  }

  start() {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref?.();
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running || !this.enabled) return;
    this.running = true;
    try {
      const latest = await this.provider.getBlockNumber();
      const safeLatest = Math.max(0, latest - this.confirmations);
      let checkpoint = await this.repository.getCheckpoint(this.serviceKey);
      if (checkpoint === null) {
        checkpoint = this.startBlock === null
          ? Math.max(0, safeLatest - 2_000)
          : Math.max(0, this.startBlock - 1);
      }

      while (checkpoint < safeLatest) {
        const toBlock = Math.min(safeLatest, checkpoint + 1_000);
        const logs = await this.provider.getLogs({
          address: this.settlementAddress,
          fromBlock: checkpoint + 1,
          toBlock,
        });
        for (const log of logs) {
          let parsed;
          try {
            parsed = this.interface.parseLog(log);
          } catch {
            continue;
          }
          if (parsed?.name === "OrderFilled") {
            const filled = await this.repository.markFilled({
              orderHash: parsed.args.orderHash,
              transactionHash: log.transactionHash,
              blockNumber: log.blockNumber,
              amountIn: parsed.args.amountIn.toString(),
              grossAmountOut: parsed.args.grossAmountOut.toString(),
              netAmountOut: parsed.args.netAmountOut.toString(),
              protocolFee: parsed.args.protocolFee.toString(),
              executor: parsed.args.executor,
            });
            if (filled) {
              this.hub.publishOrder(filled.maker, {
                type: "order",
                action: "filled",
                data: { ...filled, signature: undefined },
              });
            }
          }
          if (parsed?.name === "OrderCancelled") {
            const cancelled = await this.repository.markCancelledOnchain({
              orderHash: parsed.args.orderHash,
              transactionHash: log.transactionHash,
            });
            if (cancelled) {
              this.hub.publishOrder(cancelled.maker, {
                type: "order",
                action: "cancelled",
                data: { ...cancelled, signature: undefined },
              });
            }
          }
        }
        checkpoint = toBlock;
        await this.repository.setCheckpoint({
          serviceKey: this.serviceKey,
          chainId: GIWA_CHAIN_ID,
          contractAddress: this.settlementAddress,
          lastBlock: checkpoint,
        });
      }
    } catch (error) {
      this.logger.error("[limit-orders] event indexer failed", error);
    } finally {
      this.running = false;
    }
  }
}
