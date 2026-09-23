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
export const SNAPSHOT_REVISION = 4;
const ignoredPersonVersion = "*";
const ignoredLogVersion = "*";

function normalizedVersion(version: string) {
  const parts = version.split("|");
  if (parts.length === 7) {
    parts[3] = ignoredPersonVersion;
    parts[4] = ignoredPersonVersion;
    parts[5] = ignoredLogVersion;
    parts[6] = ignoredLogVersion;
  }
  return parts.join("|");
}

/**
 * 数据版本号只跟比赛记录有关。人物档案由展示层实时合并，牌谱缓存只有在比赛记录引用后才参与计算，
 * 两者都不单独触发统计。保留历史占位槽并归一化旧版本，部署本改动时可直接复用现有快照。
 */
async function dataVersion() {
  const db = await tournamentDatabase();
  const row = await db.prepare(`SELECT
      (SELECT COALESCE(MAX(updated_at), '') FROM competitions) AS competitionUpdatedAt,
      (SELECT COUNT(*) FROM competitions) AS competitionCount`)
    .first<Record<string, string | number>>();
  return [
    String(SNAPSHOT_REVISION),
    row?.competitionUpdatedAt ?? "",
    row?.competitionCount ?? "",
    ignoredPersonVersion,
    ignoredPersonVersion,
    ignoredLogVersion,
    ignoredLogVersion,
  ].join("|");
}

/**
 * 把"每次请求都要重算"的统计结果缓存起来：内存 → D1 快照 → 真正计算。
 * 免费版 Worker 每条请求只有 10ms CPU，重算一次要几十到几百毫秒，会直接 1102；
 * 缓存命中后只剩读一行 + 解析小 JSON，CPU 降到几毫秒。
 */
export async function cachedSnapshot<T>(
  id: string,
  compute: () => Promise<T>,
  /** 默认按正式比赛记录版本；散排统计传入自己的版本函数，互不影响。 */
  versionSource: () => Promise<string> = dataVersion,
): Promise<T> {
  // 本地开发用文件仓储，直接计算即可。
  if (!usesD1Storage()) return compute();

  let version = "";
  let db: Awaited<ReturnType<typeof tournamentDatabase>>;
  try {
    version = await versionSource();
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
    if (row && normalizedVersion(row.version) === version) {
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
