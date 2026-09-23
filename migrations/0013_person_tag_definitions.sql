CREATE TABLE IF NOT EXISTS person_tags (
  name TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

INSERT INTO person_tags (name, created_at)
VALUES ('国企办公厅', '2026-09-22T00:00:00.000Z')
ON CONFLICT(name) DO NOTHING;

UPDATE people
SET document = CASE
      WHEN json_type(document, '$.tags') = 'array'
        THEN json_insert(document, '$.tags[#]', '国企办公厅')
      ELSE json_set(document, '$.tags', json_array('国企办公厅'))
    END,
    version = version + 1,
    updated_at = '2026-09-22T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1
  FROM json_each(people.document, '$.tags') AS tag
  WHERE tag.value = '国企办公厅'
);
