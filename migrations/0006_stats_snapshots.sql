CREATE TABLE IF NOT EXISTS stats_snapshots (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
