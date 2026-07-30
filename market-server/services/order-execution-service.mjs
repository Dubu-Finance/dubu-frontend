import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  getAddress,
  isAddress,
} from "ethers";

const SETTLEMENT_ABI = [
  "function fillOrder((address maker,address receiver,address tokenIn,address tokenOut,uint256 amountIn,uint256 minAmountOut,uint64 validAfter,uint64 expiry,uint256 nonce,uint256 salt,uint16 maxFeeBps) order,bytes signature,bytes routerCalldata) returns (uint256 netAmountOut)",
  "event OrderFilled(bytes32 indexed orderHash,address indexed maker,address indexed receiver,address tokenIn,address tokenOut,uint256 amountIn,uint256 grossAmountOut,uint256 netAmountOut,uint256 protocolFee,address executor)",
  "event OrderCancelled(bytes32 indexed orderHash,address indexed maker)",
];

function contractOrder(order) {
  return {
    maker: order.maker,
    receiver: order.receiver,
    tokenIn: order.tokenIn,
    tokenOut: order.tokenOut,
    amountIn: order.amountIn,
    minAmountOut: order.minAmountOut,
    validAfter: order.validAfter,
    expiry: order.expiry,
    nonce: order.nonce,
    salt: order.salt,
    maxFeeBps: order.maxFeeBps,
  };
}

function errorMessage(error) {
  if (error instanceof Error) {
    return error.shortMessage ?? error.reason ?? error.message;
  }
  return String(error);
}

export class OrderExecutionService {
  constructor({
    repository,
    hub,
    rpcUrl,
    aggregatorUrl,
    settlementAddress,
    executorPrivateKey,
    allowRfq,
    confirmations,
  }) {
    this.repository = repository;
    this.hub = hub;
    this.aggregatorUrl = aggregatorUrl.replace(/\/+$/, "");
    this.settlementAddress = settlementAddress;
    this.allowRfq = allowRfq;
    this.confirmations = confirmations;
    this.enabled = isAddress(settlementAddress) && Boolean(executorPrivateKey);
    this.interface = new Interface(SETTLEMENT_ABI);

    if (this.enabled) {
      this.provider = new JsonRpcProvider(rpcUrl);
      const key = executorPrivateKey.startsWith("0x")
        ? executorPrivateKey
        : `0x${executorPrivateKey}`;
      this.wallet = new Wallet(key, this.provider);
      this.contract = new Contract(settlementAddress, SETTLEMENT_ABI, this.wallet);
    }
  }

  async fetchExecutableQuote(order) {
    const response = await fetch(`${this.aggregatorUrl}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenIn: order.tokenIn,
        tokenOut: order.tokenOut,
        amountIn: order.amountIn,
        receiver: this.settlementAddress,
        slippageBps: 25,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    const quote = await response.json();
    if (!response.ok || quote.error) {
      throw new Error(quote.detail || quote.error || `Aggregator returned ${response.status}`);
    }
    return quote;
  }

  async execute(order) {
    if (!this.enabled) {
      await this.repository.releaseOrder(order, {
        delayMs: 30_000,
        error: "Limit-order executor is not configured.",
      });
      return;
    }

    let quote;
    let submittedHash = null;
    try {
      quote = await this.fetchExecutableQuote(order);
    } catch (error) {
      await this.repository.releaseOrder(order, {
        delayMs: 5_000,
        error: errorMessage(error),
      });
      return;
    }

    const venues = Array.isArray(quote.route?.venues) ? quote.route.venues : [];
    if (!this.allowRfq && venues.includes("rfq")) {
      await this.repository.releaseOrder(order, {
        delayMs: 2_000,
        quotedAmountOut: quote.amountOut,
        venues,
      });
      return;
    }

    const grossAmountOut = BigInt(quote.amountOut);
    const worstFee = (grossAmountOut * BigInt(order.maxFeeBps)) / 10_000n;
    if (grossAmountOut - worstFee < BigInt(order.minAmountOut)) {
      await this.repository.releaseOrder(order, {
        delayMs: 2_500,
        quotedAmountOut: quote.amountOut,
        venues,
      });
      return;
    }

    const data = this.interface.encodeFunctionData("fillOrder", [
      contractOrder(order),
      order.signature,
      quote.route.data,
    ]);

    try {
      await this.provider.call({
        from: this.wallet.address,
        to: getAddress(this.settlementAddress),
        data,
      });
      const estimatedGas = await this.provider.estimateGas({
        from: this.wallet.address,
        to: getAddress(this.settlementAddress),
        data,
      });
      const transaction = await this.wallet.sendTransaction({
        to: getAddress(this.settlementAddress),
        data,
        gasLimit: (estimatedGas * 120n) / 100n,
      });
      submittedHash = transaction.hash;
      await this.repository.markSubmitted(order, {
        transactionHash: transaction.hash,
        quotedAmountOut: quote.amountOut,
        venues,
      });
      this.hub.publishOrder(order.maker, {
        type: "order",
        action: "submitted",
        data: { ...order, signature: undefined, executionTxHash: transaction.hash },
      });

      const receipt = await transaction.wait(this.confirmations);
      if (!receipt || receipt.status !== 1) {
        throw new Error("Settlement transaction reverted.");
      }
      const parsed = receipt.logs
        .map((log) => {
          try {
            return this.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event) => event?.name === "OrderFilled");
      if (!parsed) throw new Error("OrderFilled event was not emitted.");

      const filled = await this.repository.markFilled({
        orderHash: parsed.args.orderHash,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        amountIn: parsed.args.amountIn.toString(),
        grossAmountOut: parsed.args.grossAmountOut.toString(),
        netAmountOut: parsed.args.netAmountOut.toString(),
        protocolFee: parsed.args.protocolFee.toString(),
        executor: parsed.args.executor,
        venues,
      });
      if (filled) {
        this.hub.publishOrder(filled.maker, {
          type: "order",
          action: "filled",
          data: { ...filled, signature: undefined },
        });
      }
    } catch (error) {
      const message = errorMessage(error);
      const receipt = error?.receipt;
      if (submittedHash && receipt?.status !== 0) {
        await this.repository.markExecutionUncertain(order, message);
        return;
      }
      await this.repository.markExecutionFailed(order, message);
      this.hub.publishOrder(order.maker, {
        type: "order",
        action: "retry",
        data: {
          orderHash: order.orderHash,
          status: "open",
          lastError: message,
        },
      });
    }
  }
}

export { SETTLEMENT_ABI };
