CREATE TABLE IF NOT EXISTS avatars (
  key TEXT PRIMARY KEY,
  body BLOB NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
