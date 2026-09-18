import "server-only";

import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";

type SnapshotRow = { version: string; document: string };

type MemoryEntry = { version: string; value: unknown };

// 同一个 isolate 反复渲染同一页面时直接命中内存，连 D1 都不用读。
const memory = new Map<string, MemoryEntry>();

/**
 * 统计口径或字段有任何变化时手动 +1：版本号里带上它，历史快照会自动失效并重算。
 * 只改代码不改数据时，这一步是唯一能让旧快照失效的办法。
 */
export const SNAPSHOT_REVISION = 2;

/**
 * 数据版本号：任何写入（比赛、人物、牌谱缓存）都会让 updated_at / created_at 变化，
 * 从而自动让旧快照失效。只查一行聚合值，几乎不消耗 CPU。
 */
async function dataVersion() {
  const db = await tournamentDatabase();
  const row = await db.prepare(`SELECT
      (SELECT COALESCE(MAX(updated_at), '') FROM competitions) AS competitionUpdatedAt,
      (SELECT COUNT(*) FROM competitions) AS competitionCount,
      (SELECT COALESCE(MAX(updated_at), '') FROM people) AS personUpdatedAt,
      (SELECT COUNT(*) FROM people) AS personCount,
      (SELECT COALESCE(MAX(created_at), '') FROM logs) AS logCreatedAt,
      (SELECT COUNT(*) FROM logs) AS logCount`)
    .first<Record<string, string | number>>();
  return [
    String(SNAPSHOT_REVISION),
    row?.competitionUpdatedAt ?? "",
    row?.competitionCount ?? "",
    row?.personUpdatedAt ?? "",
    row?.personCount ?? "",
    row?.logCreatedAt ?? "",
    row?.logCount ?? "",
  ].join("|");
}

/**
 * 把"每次请求都要重算"的统计结果缓存起来：内存 → D1 快照 → 真正计算。
 * 免费版 Worker 每条请求只有 10ms CPU，重算一次要几十到几百毫秒，会直接 1102；
 * 缓存命中后只剩读一行 + 解析小 JSON，CPU 降到几毫秒。
 */
export async function cachedSnapshot<T>(id: string, compute: () => Promise<T>): Promise<T> {
  // 本地开发用文件仓储，直接计算即可。
  if (!usesD1Storage()) return compute();

  let version = "";
  let db: Awaited<ReturnType<typeof tournamentDatabase>>;
  try {
    version = await dataVersion();
    db = await tournamentDatabase();
  } catch {
    return compute();
  }

  const memo = memory.get(id);
  if (memo && memo.version === version) return memo.value as T;

  try {
    const row = await db.prepare("SELECT version, document FROM stats_snapshots WHERE id = ?")
      .bind(id)
      .first<SnapshotRow>();
    if (row && row.version === version) {
      const value = JSON.parse(row.document) as T;
      memory.set(id, { version, value });
      return value;
    }
  } catch {
    // 读快照失败不影响正确性，继续走重算。
  }

  const value = await compute();
  memory.set(id, { version, value });
  try {
    await db.prepare("INSERT INTO stats_snapshots (id, version, document, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, document = excluded.document, updated_at = excluded.updated_at")
      .bind(id, version, JSON.stringify(value), new Date().toISOString())
      .run();
  } catch {
    // 写缓存失败不影响本次结果。
  }
  return value;
}

/** 仅供测试使用：清空 isolate 内存缓存。 */
export function resetSnapshotMemory() {
  memory.clear();
}
