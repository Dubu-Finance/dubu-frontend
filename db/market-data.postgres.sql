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
