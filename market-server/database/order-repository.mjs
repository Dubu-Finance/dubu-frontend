import { randomUUID } from "node:crypto";
import { withTransaction } from "./client.mjs";

function rowToOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderHash: row.order_hash,
    chainId: Number(row.chain_id),
    settlementAddress: row.settlement_address,
    marketId: row.market_id,
    side: row.side,
    maker: row.maker,
    receiver: row.receiver,
    tokenIn: row.token_in,
    tokenOut: row.token_out,
    amountIn: row.amount_in,
    minAmountOut: row.min_amount_out,
    limitPrice: row.limit_price,
    validAfter: String(row.valid_after),
    expiry: String(Math.floor(new Date(row.expires_at).getTime() / 1000)),
    nonce: row.nonce,
    salt: row.salt,
    maxFeeBps: Number(row.max_fee_bps),
    signature: row.signature,
    status: row.status,
    executionTxHash: row.execution_tx_hash,
    fillTxHash: row.fill_tx_hash,
    cancelTxHash: row.cancel_tx_hash,
    actualAmountIn: row.actual_amount_in,
    actualAmountOut: row.actual_amount_out,
    protocolFee: row.protocol_fee,
    lastError: row.last_error,
    attemptCount: row.attempt_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    filledAt: row.filled_at ? new Date(row.filled_at).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
  };
}

async function insertEvent(client, { orderId, orderHash, eventType, payload = {} }) {
  await client.query(
    `INSERT INTO order_events (order_id, order_hash, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [orderId, orderHash, eventType, JSON.stringify(payload)],
  );
}

export class OrderRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async createOrder(input) {
    return withTransaction(this.pool, async (client) => {
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO limit_orders (
           id, order_hash, chain_id, settlement_address, market_id, side,
           maker, receiver, token_in, token_out, amount_in, min_amount_out,
           limit_price, valid_after, expires_at, nonce, salt, max_fee_bps, signature
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12,
           $13, $14, TO_TIMESTAMP($15), $16, $17, $18, $19
         )
         ON CONFLICT (order_hash) DO NOTHING
         RETURNING *`,
        [
          id,
          input.orderHash,
          input.chainId,
          input.settlementAddress,
          input.marketId,
          input.side,
          input.maker.toLowerCase(),
          input.receiver.toLowerCase(),
          input.tokenIn.toLowerCase(),
          input.tokenOut.toLowerCase(),
          input.amountIn,
          input.minAmountOut,
          input.limitPrice,
          input.validAfter,
          input.expiry,
          input.nonce,
          input.salt,
          input.maxFeeBps,
          input.signature,
        ],
      );

      let row = result.rows[0];
      if (!row) {
        const existing = await client.query(
          "SELECT * FROM limit_orders WHERE order_hash = $1",
          [input.orderHash],
        );
        row = existing.rows[0];
      } else {
        await insertEvent(client, {
          orderId: id,
          orderHash: input.orderHash,
          eventType: "created",
          payload: { marketId: input.marketId, side: input.side },
        });
      }
      return rowToOrder(row);
    });
  }

  async getOrder(identifier) {
    const result = await this.pool.query(
      `SELECT * FROM limit_orders
       WHERE id::text = $1 OR order_hash = $1
       LIMIT 1`,
      [identifier],
    );
    return rowToOrder(result.rows[0]);
  }

  async listOrders({ maker, status, limit = 100 }) {
    const statuses = status === "active"
      ? ["open", "executing"]
      : status === "history"
        ? ["filled", "cancelled", "expired", "failed"]
        : null;
    const params = [maker.toLowerCase(), Math.min(200, Math.max(1, limit))];
    const statusClause = statuses
      ? `AND status = ANY($3::text[])`
      : "";
    if (statuses) params.push(statuses);
    const result = await this.pool.query(
      `SELECT * FROM limit_orders
       WHERE maker = $1 ${statusClause}
       ORDER BY created_at DESC
       LIMIT $2`,
      params,
    );
    return result.rows.map(rowToOrder);
  }

  async cancelOrder({ orderHash, maker }) {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE limit_orders
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(), last_error = NULL
         WHERE order_hash = $1 AND maker = $2 AND status = 'open'
         RETURNING *`,
        [orderHash, maker.toLowerCase()],
      );
      const row = result.rows[0];
      if (!row) return null;
      await insertEvent(client, {
        orderId: row.id,
        orderHash,
        eventType: "cancelled_offchain",
        payload: { maker: maker.toLowerCase() },
      });
      return rowToOrder(row);
    });
  }

  async expireOrders() {
    const result = await this.pool.query(
      `UPDATE limit_orders
       SET status = 'expired', updated_at = NOW(), last_error = NULL
       WHERE status IN ('open', 'executing') AND expires_at <= NOW()
       RETURNING *`,
    );
    return result.rows.map(rowToOrder);
  }

  async recoverStaleExecutingOrders() {
    const result = await this.pool.query(
      `UPDATE limit_orders
       SET status = 'open',
           next_attempt_at = NOW(),
           last_error = 'Recovered after an interrupted execution attempt.',
           updated_at = NOW()
       WHERE status = 'executing'
         AND updated_at < NOW() - INTERVAL '2 minutes'
       RETURNING *`,
    );
    return result.rows.map(rowToOrder);
  }

  async claimOpenOrders(limit = 20) {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `WITH candidates AS (
         SELECT id
           FROM limit_orders
           WHERE status = 'open'
             AND expires_at > NOW()
             AND next_attempt_at <= NOW()
           ORDER BY next_attempt_at ASC, created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE limit_orders AS orders
         SET status = 'executing',
             attempt_count = attempt_count + 1,
             updated_at = NOW()
         FROM candidates
         WHERE orders.id = candidates.id
         RETURNING orders.*`,
        [Math.min(100, Math.max(1, limit))],
      );
      return result.rows.map(rowToOrder);
    });
  }

  async releaseOrder(order, { delayMs = 3_000, error = null, quotedAmountOut = null, venues = [] } = {}) {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE limit_orders
         SET status = 'open',
             next_attempt_at = NOW() + ($2 * INTERVAL '1 millisecond'),
             last_error = $3,
             updated_at = NOW()
         WHERE id = $1 AND status = 'executing'`,
        [order.id, delayMs, error],
      );
      await client.query(
        `INSERT INTO order_execution_attempts (
           id, order_id, status, quoted_amount_out, venues, error_message
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          randomUUID(),
          order.id,
          error ? "failed" : "skipped",
          quotedAmountOut,
          JSON.stringify(venues),
          error,
        ],
      );
    });
  }

  async markSubmitted(order, { transactionHash, quotedAmountOut, venues }) {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE limit_orders
         SET execution_tx_hash = $2, last_error = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'executing'`,
        [order.id, transactionHash],
      );
      await client.query(
        `INSERT INTO order_execution_attempts (
           id, order_id, status, quoted_amount_out, transaction_hash, venues
         ) VALUES ($1, $2, 'submitted', $3, $4, $5::jsonb)`,
        [
          randomUUID(),
          order.id,
          quotedAmountOut,
          transactionHash,
          JSON.stringify(venues ?? []),
        ],
      );
      await insertEvent(client, {
        orderId: order.id,
        orderHash: order.orderHash,
        eventType: "execution_submitted",
        payload: { transactionHash, quotedAmountOut, venues },
      });
    });
  }

  async markExecutionFailed(order, error, { terminal = false } = {}) {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE limit_orders
         SET status = $2,
             next_attempt_at = NOW() + INTERVAL '10 seconds',
             last_error = $3,
             updated_at = NOW()
         WHERE id = $1 AND status = 'executing'`,
        [order.id, terminal ? "failed" : "open", error],
      );
      await client.query(
        `INSERT INTO order_execution_attempts (
           id, order_id, status, transaction_hash, error_message
         ) VALUES ($1, $2, 'failed', $3, $4)`,
        [randomUUID(), order.id, order.executionTxHash, error],
      );
      await insertEvent(client, {
        orderId: order.id,
        orderHash: order.orderHash,
        eventType: terminal ? "failed" : "execution_retry",
        payload: { error },
      });
    });
  }

  async markExecutionUncertain(order, error) {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE limit_orders
         SET last_error = $2, updated_at = NOW()
         WHERE id = $1 AND status = 'executing'`,
        [order.id, error],
      );
      await insertEvent(client, {
        orderId: order.id,
        orderHash: order.orderHash,
        eventType: "execution_pending_confirmation",
        payload: { error },
      });
    });
  }

  async markFilled({
    orderHash,
    transactionHash,
    blockNumber,
    amountIn,
    grossAmountOut,
    netAmountOut,
    protocolFee,
    executor,
    venues = [],
  }) {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE limit_orders
         SET status = 'filled',
             fill_tx_hash = $2,
             actual_amount_in = $3,
             actual_amount_out = $4,
             protocol_fee = $5,
             last_error = NULL,
             filled_at = NOW(),
             updated_at = NOW()
         WHERE order_hash = $1
           AND status <> 'filled'
           AND cancel_tx_hash IS DISTINCT FROM $2
         RETURNING *`,
        [orderHash, transactionHash, amountIn, netAmountOut, protocolFee],
      );
      const row = result.rows[0];
      if (!row) return null;

      await client.query(
        `INSERT INTO order_fills (
           id, order_id, order_hash, transaction_hash, block_number,
           amount_in, gross_amount_out, net_amount_out, protocol_fee, executor, venues
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
         ON CONFLICT (transaction_hash) DO NOTHING`,
        [
          randomUUID(),
          row.id,
          orderHash,
          transactionHash,
          blockNumber,
          amountIn,
          grossAmountOut,
          netAmountOut,
          protocolFee,
          executor,
          JSON.stringify(venues),
        ],
      );
      await client.query(
        `UPDATE order_execution_attempts
         SET status = 'confirmed'
         WHERE id = (
           SELECT id FROM order_execution_attempts
           WHERE order_id = $1 AND status = 'submitted'
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [row.id],
      );
      await insertEvent(client, {
        orderId: row.id,
        orderHash,
        eventType: "filled",
        payload: {
          transactionHash,
          blockNumber,
          amountIn,
          grossAmountOut,
          netAmountOut,
          protocolFee,
        },
      });
      return rowToOrder(row);
    });
  }

  async markCancelledOnchain({ orderHash, transactionHash }) {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE limit_orders
         SET status = 'cancelled',
             cancel_tx_hash = COALESCE($2, cancel_tx_hash),
             cancelled_at = COALESCE(cancelled_at, NOW()),
             updated_at = NOW()
         WHERE order_hash = $1 AND status <> 'filled'
         RETURNING *`,
        [orderHash, transactionHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      await insertEvent(client, {
        orderId: row.id,
        orderHash,
        eventType: "cancelled_onchain",
        payload: { transactionHash },
      });
      return rowToOrder(row);
    });
  }

  async getCheckpoint(serviceKey) {
    const result = await this.pool.query(
      "SELECT last_block FROM chain_checkpoints WHERE service_key = $1",
      [serviceKey],
    );
    return result.rows[0] ? Number(result.rows[0].last_block) : null;
  }

  async setCheckpoint({ serviceKey, chainId, contractAddress, lastBlock }) {
    await this.pool.query(
      `INSERT INTO chain_checkpoints (
         service_key, chain_id, contract_address, last_block
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (service_key) DO UPDATE SET
         chain_id = EXCLUDED.chain_id,
         contract_address = EXCLUDED.contract_address,
         last_block = EXCLUDED.last_block,
         updated_at = NOW()`,
      [serviceKey, chainId, contractAddress.toLowerCase(), lastBlock],
    );
  }
}
