UPDATE people
SET document = json_set(document, '$.tags', json_array('国企办公厅')),
    version = version + 1
WHERE json_extract(document, '$.kind') = 'human'
  AND json_type(document, '$.tags') IS NULL;

UPDATE competitions
SET document = json_set(document, '$.autoIncludePersonTags', json_array('国企办公厅')),
    version = version + 1
WHERE id = 'match-pool'
  AND json_type(document, '$.autoIncludePersonTags') IS NULL;
