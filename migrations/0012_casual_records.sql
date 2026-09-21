-- 散排（自选牌谱）与正式比赛数据完全分离：单独的表、单独的统计快照、单独的牌谱缓存。
CREATE TABLE IF NOT EXISTS casual_logs (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS casual_matches (
  id TEXT PRIMARY KEY,
  created_by_person_id TEXT,
  created_by_username TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  document TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS casual_matches_created_at ON casual_matches (created_at DESC);
