ALTER TABLE people ADD COLUMN statistics_updated_at TEXT;

UPDATE people
SET statistics_updated_at = updated_at
WHERE statistics_updated_at IS NULL;
