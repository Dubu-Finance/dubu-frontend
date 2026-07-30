CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  display_symbol TEXT NOT NULL UNIQUE,
  base_token TEXT NOT NULL,
  quote_token TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candles (
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  interval TEXT NOT NULL,
  open_time BIGINT NOT NULL,
  close_time BIGINT NOT NULL,
  open NUMERIC(38, 18) NOT NULL,
  high NUMERIC(38, 18) NOT NULL,
  low NUMERIC(38, 18) NOT NULL,
  close NUMERIC(38, 18) NOT NULL,
  base_volume NUMERIC(38, 18) NOT NULL,
  quote_volume NUMERIC(38, 18) NOT NULL,
  trade_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market_id, interval, open_time)
);

CREATE INDEX IF NOT EXISTS candles_market_interval_time_idx
ON candles (market_id, interval, open_time DESC);

-- The deployed quote token at 0xd285...5155 is mUSDC. Older market-data
-- builds labeled the same token as mUSDT, so migrate those internal IDs
-- without discarding their candle history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'candles_market_id_fkey'
      AND conrelid = 'candles'::regclass
      AND confupdtype <> 'c'
  ) THEN
    ALTER TABLE candles DROP CONSTRAINT candles_market_id_fkey;
    ALTER TABLE candles
      ADD CONSTRAINT candles_market_id_fkey
      FOREIGN KEY (market_id) REFERENCES markets(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END
$$;

UPDATE markets
SET
  id = REPLACE(id, '-musdt', '-musdc'),
  display_symbol = REPLACE(display_symbol, '/mUSDT', '/mUSDC'),
  quote_token = 'mUSDC',
  updated_at = NOW()
WHERE id LIKE '%-musdt';

CREATE TABLE IF NOT EXISTS backfill_runs (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  interval TEXT NOT NULL,
  range_start BIGINT NOT NULL,
  range_end BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  rows_written INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS limit_orders (
  id UUID PRIMARY KEY,
  order_hash TEXT NOT NULL UNIQUE,
  chain_id BIGINT NOT NULL,
  settlement_address TEXT NOT NULL,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  maker TEXT NOT NULL,
  receiver TEXT NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_in NUMERIC(78, 0) NOT NULL CHECK (amount_in > 0),
  min_amount_out NUMERIC(78, 0) NOT NULL CHECK (min_amount_out > 0),
  limit_price NUMERIC(38, 18) NOT NULL CHECK (limit_price > 0),
  valid_after BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  nonce NUMERIC(78, 0) NOT NULL,
  salt NUMERIC(78, 0) NOT NULL,
  max_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK (max_fee_bps BETWEEN 0 AND 100),
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'executing', 'filled', 'cancelled', 'expired', 'failed')),
  execution_tx_hash TEXT,
  fill_tx_hash TEXT,
  cancel_tx_hash TEXT,
  actual_amount_in NUMERIC(78, 0),
  actual_amount_out NUMERIC(78, 0),
  protocol_fee NUMERIC(78, 0),
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS limit_orders_maker_status_created_idx
ON limit_orders (maker, status, created_at DESC);

CREATE INDEX IF NOT EXISTS limit_orders_matcher_idx
ON limit_orders (status, next_attempt_at, expires_at)
WHERE status IN ('open', 'executing');

CREATE TABLE IF NOT EXISTS order_fills (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES limit_orders(id) ON DELETE CASCADE,
  order_hash TEXT NOT NULL,
  transaction_hash TEXT NOT NULL UNIQUE,
  block_number BIGINT,
  amount_in NUMERIC(78, 0) NOT NULL,
  gross_amount_out NUMERIC(78, 0) NOT NULL,
  net_amount_out NUMERIC(78, 0) NOT NULL,
  protocol_fee NUMERIC(78, 0) NOT NULL DEFAULT 0,
  executor TEXT,
  venues JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_fills_order_id_idx
ON order_fills (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID REFERENCES limit_orders(id) ON DELETE CASCADE,
  order_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_events_order_created_idx
ON order_events (order_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS order_execution_attempts (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES limit_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('quoted', 'skipped', 'submitted', 'confirmed', 'failed')),
  quoted_amount_out NUMERIC(78, 0),
  transaction_hash TEXT,
  venues JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_attempts_order_created_idx
ON order_execution_attempts (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chain_checkpoints (
  service_key TEXT PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  contract_address TEXT NOT NULL,
  last_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
