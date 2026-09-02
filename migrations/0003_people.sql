CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO people (id, document, version, created_at, updated_at) VALUES
('hmx', '{"id":"hmx","displayName":"何 明轩","kind":"human","color":"#168f83","aliases":["hmx","何明轩","何 明轩","東海大黄魚","猫妥"],"accounts":[{"platform":"tenhou","username":"東海大黄魚"},{"platform":"tenhou","username":"猫妥"}]}', 1, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
('xiaop', '{"id":"xiaop","displayName":"彭 虹清","kind":"human","color":"#d58a18","aliases":["xiaop","彭虹清","彭 虹清","風蛍月","猫妥","lechanNa","こくらあさひ","ハンバーガー"],"accounts":[{"platform":"tenhou","username":"風蛍月"},{"platform":"tenhou","username":"猫妥"},{"platform":"tenhou","username":"lechanNa"},{"platform":"tenhou","username":"こくらあさひ"},{"platform":"tenhou","username":"ハンバーガー"}]}', 1, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
('naga', '{"id":"naga","displayName":"NAGA","kind":"ai","color":"#6657c7","aliases":["NAGA","nagaカガシ"],"accounts":[]}', 1, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
('mortal', '{"id":"mortal","displayName":"Mortal","kind":"ai","color":"#4f5962","aliases":["Mortal","NoName","Mortal 4.1b"],"accounts":[{"platform":"tenhou","username":"NoName"}]}', 1, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
('wu-dongjie', '{"id":"wu-dongjie","displayName":"吴 东杰","kind":"human","color":"#d1495b","aliases":["吴东杰","吴 东杰","Veritas"],"accounts":[{"platform":"tenhou","username":"Veritas"}]}', 1, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
('e-ziyi', '{"id":"e-ziyi","displayName":"鄂 子懿","kind":"human","color":"#3b78a0","aliases":["鄂子懿","鄂 子懿","mzhj"],"accounts":[{"platform":"tenhou","username":"mzhj"}]}', 1, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING;

UPDATE competitions SET document = json_set(
  document,
  '$.participants[0].personId', 'hmx',
  '$.participants[1].personId', 'xiaop',
  '$.participants[2].personId', 'naga',
  '$.participants[3].personId', 'mortal'
) WHERE id = '1st-xrc';

UPDATE competitions SET document = json_set(
  document,
  '$.participants[0].personId', 'wu-dongjie',
  '$.participants[1].personId', 'hmx',
  '$.participants[2].personId', 'e-ziyi',
  '$.participants[3].personId', 'xiaop'
) WHERE id = '1st-rc';
