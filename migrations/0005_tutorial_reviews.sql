CREATE TABLE IF NOT EXISTS tutorial_case_states (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tutorial_case_states_updated
  ON tutorial_case_states (updated_at DESC);
