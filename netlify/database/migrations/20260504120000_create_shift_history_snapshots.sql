CREATE TABLE shift_history_snapshots (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL
);

CREATE INDEX idx_shift_history_snapshots_created_at ON shift_history_snapshots (created_at DESC);
