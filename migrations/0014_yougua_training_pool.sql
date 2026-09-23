INSERT INTO person_tags (name, created_at)
VALUES ('你瓜提高班', '2026-09-22T02:00:00.000Z')
ON CONFLICT(name) DO NOTHING;

INSERT INTO people (id, document, version, created_at, updated_at) VALUES
('luanhua', '{"id":"luanhua","displayName":"乱花","kind":"human","color":"#168f83","aliases":["乱花","、乱花"],"accounts":[{"platform":"majsoul","username":"、乱花"}],"tags":["你瓜提高班"],"majsoulRank":"雀杰3"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('GA', '{"id":"GA","displayName":"GA","kind":"human","color":"#d1495b","aliases":["GA","GA_Official"],"accounts":[{"platform":"majsoul","username":"GA_Official"}],"tags":["你瓜提高班"],"majsoulRank":"雀豪2"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('maodan6', '{"id":"maodan6","displayName":"maodan6","kind":"human","color":"#168f83","aliases":["maodan6"],"accounts":[{"platform":"majsoul","username":"maodan6"}],"tags":["你瓜提高班"],"majsoulRank":"雀杰3"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('未来', '{"id":"未来","displayName":"未来","kind":"human","color":"#6657c7","aliases":["未来","未来会有未来"],"accounts":[{"platform":"majsoul","username":"未来会有未来"}],"tags":["你瓜提高班"],"majsoulRank":"雀杰3"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('MartyrKun', '{"id":"MartyrKun","displayName":"MartyrKun","kind":"human","color":"#d58a18","aliases":["MartyrKun"],"accounts":[{"platform":"majsoul","username":"MartyrKun"}],"tags":["你瓜提高班"]}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('由包不是豆奶', '{"id":"由包不是豆奶","displayName":"由包不是豆奶","kind":"human","color":"#4e8fc5","aliases":["由包不是豆奶","神之114514手"],"accounts":[{"platform":"majsoul","username":"神之114514手"}],"tags":["你瓜提高班"],"majsoulRank":"雀士2"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('25时', '{"id":"25时","displayName":"25时","kind":"human","color":"#9c5f9c","aliases":["25时","星野爱Ai"],"accounts":[{"platform":"majsoul","username":"星野爱Ai"}],"tags":["你瓜提高班"],"majsoulRank":"雀士2"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('养老的小王子', '{"id":"养老的小王子","displayName":"养老的小王子","kind":"human","color":"#4d9b73","aliases":["养老的小王子"],"accounts":[{"platform":"majsoul","username":"养老的小王子"}],"tags":["你瓜提高班"],"majsoulRank":"雀士2"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('浮云', '{"id":"浮云","displayName":"浮云","kind":"human","color":"#b56a3b","aliases":["浮云","kkfym"],"accounts":[{"platform":"majsoul","username":"kkfym"}],"tags":["你瓜提高班"],"majsoulRank":"雀士1"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('枣十三', '{"id":"枣十三","displayName":"枣十三","kind":"human","color":"#d1495b","aliases":["枣十三"],"accounts":[{"platform":"majsoul","username":"枣十三"}],"tags":["你瓜提高班"],"majsoulRank":"雀豪1"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('风云一心', '{"id":"风云一心","displayName":"风云一心","kind":"human","color":"#168f83","aliases":["风云一心"],"accounts":[{"platform":"majsoul","username":"风云一心"}],"tags":["你瓜提高班"],"majsoulRank":"雀杰3"}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('TNT', '{"id":"TNT","displayName":"TNT","kind":"human","color":"#6657c7","aliases":["TNT","磁铁ouo"],"accounts":[{"platform":"majsoul","username":"磁铁ouo"}],"tags":["你瓜提高班"]}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'),
('Leeflament', '{"id":"Leeflament","displayName":"Leeflament","kind":"human","color":"#d58a18","aliases":["Leeflament","种初慈禧"],"accounts":[{"platform":"majsoul","username":"种初慈禧"}],"tags":["你瓜提高班"]}', 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z')
ON CONFLICT(id) DO NOTHING;

UPDATE people
SET document = json_insert(document, '$.tags[#]', '你瓜提高班'),
    version = version + 1,
    updated_at = '2026-09-22T02:00:00.000Z'
WHERE id IN ('luanhua', 'GA', 'maodan6', '未来', 'MartyrKun', '由包不是豆奶', '25时', '养老的小王子', '浮云', '枣十三', '风云一心', 'TNT', 'Leeflament')
  AND NOT EXISTS (
    SELECT 1 FROM json_each(people.document, '$.tags') AS tag WHERE tag.value = '你瓜提高班'
  );

INSERT INTO competitions (id, document, version, created_at, updated_at)
SELECT 'yougua-training', json_object(
  'id', 'yougua-training',
  'name', '你瓜提高班',
  'code', 'YOUGUA-TRAINING',
  'format', 'four_player',
  'status', 'active',
  'plannedMatchCount', 100000,
  'initialPoints', 25000,
  'rankPoints', json_array(30, 10, -10, -30),
  'participants', json((
    SELECT json_group_array(json_object(
      'id', 'person-' || id,
      'personId', id,
      'displayName', json_extract(document, '$.displayName'),
      'kind', json_extract(document, '$.kind'),
      'color', json_extract(document, '$.color'),
      'usernames', json_array(json_extract(document, '$.displayName'), json_extract(document, '$.accounts[0].username'))
    ))
    FROM people
    WHERE id IN ('luanhua', 'GA', 'maodan6', '未来', 'MartyrKun', '由包不是豆奶', '25时', '养老的小王子', '浮云', '枣十三', '风云一心', 'TNT', 'Leeflament')
  )),
  'matches', json_array(),
  'autoIncludePersonTags', json_array('你瓜提高班')
), 1, '2026-09-22T02:00:00.000Z', '2026-09-22T02:00:00.000Z'
WHERE (SELECT COUNT(*) FROM people WHERE id IN ('luanhua', 'GA', 'maodan6', '未来', 'MartyrKun', '由包不是豆奶', '25时', '养老的小王子', '浮云', '枣十三', '风云一心', 'TNT', 'Leeflament')) = 13
ON CONFLICT(id) DO NOTHING;
