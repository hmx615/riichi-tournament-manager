CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competition_backups (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  document TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS competition_backups_competition_created
  ON competition_backups (competition_id, created_at DESC);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  address TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
