CREATE TABLE IF NOT EXISTS club_registrations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  nickname TEXT NOT NULL,
  qq TEXT NOT NULL,
  majsoul_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  current_rank TEXT NOT NULL,
  goals TEXT NOT NULL,
  account_ownership_confirmed INTEGER NOT NULL CHECK (account_ownership_confirmed = 1),
  privacy_consent INTEGER NOT NULL CHECK (privacy_consent = 1),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS club_registrations_created_at
  ON club_registrations (created_at DESC);
