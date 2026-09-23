import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { CasualRecord } from "@/domain/casual-record";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";
import { validateTenhouLog, type TenhouLog } from "@/server/tenhou";
import { SNAPSHOT_REVISION } from "@/server/stats-snapshot";

/** 散排数据独立存放：牌谱原文在 casual_logs，对局记录在 casual_matches，与比赛数据零耦合。 */
const recordsFile = path.join(dataDirectory, "casual-records.json");
const logsDirectory = path.join(dataDirectory, "casual", "logs");

async function localRecords(): Promise<CasualRecord[]> {
  try {
    const value = JSON.parse(await fs.readFile(recordsFile, "utf8")) as CasualRecord[];
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalRecords(records: CasualRecord[]) {
  await fs.mkdir(path.dirname(recordsFile), { recursive: true });
  const temporary = `${recordsFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { flag: "w" });
  try {
    await fs.rename(temporary, recordsFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function newestFirst(records: CasualRecord[]) {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listCasualRecords(): Promise<CasualRecord[]> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("SELECT document FROM casual_matches ORDER BY created_at DESC")
      .all<{ document: string }>();
    return result.results.map((row) => JSON.parse(row.document) as CasualRecord);
  }
  return newestFirst(await localRecords());
}

export async function getCasualRecord(id: string): Promise<CasualRecord | null> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT document FROM casual_matches WHERE id = ?").bind(id).first<{ document: string }>();
    return row ? JSON.parse(row.document) as CasualRecord : null;
  }
  return (await localRecords()).find((record) => record.id === id) ?? null;
}

export async function findCasualRecordByLog(logId: string, contentFingerprint?: string) {
  const records = await listCasualRecords();
  return records.find((record) => record.tenhouLogId === logId
    || Boolean(contentFingerprint && record.contentFingerprint === contentFingerprint)) ?? null;
}

async function writeLocalLog(log: TenhouLog) {
  await fs.mkdir(logsDirectory, { recursive: true });
  await fs.writeFile(path.join(logsDirectory, `${log.ref}.json`), `${JSON.stringify(log)}\n`);
}

/** 解析阶段也只写散排缓存，不能触碰正式比赛的 logs 表。 */
export async function cacheCasualLog(log: TenhouLog) {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    await db.prepare("INSERT INTO casual_logs (id, document, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document")
      .bind(log.ref, JSON.stringify(log), new Date().toISOString())
      .run();
    return;
  }
  await writeLocalLog(log);
}

export async function saveCasualRecord(record: CasualRecord, log: TenhouLog) {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const now = new Date().toISOString();
    const results = await db.batch([
      db.prepare("INSERT INTO casual_logs (id, document, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document")
        .bind(log.ref, JSON.stringify(log), now),
      db.prepare("INSERT INTO casual_matches (id, created_by_person_id, created_by_username, created_at, document) VALUES (?, ?, ?, ?, ?)")
        .bind(record.id, record.createdByPersonId, record.createdByUsername, record.createdAt, JSON.stringify(record)),
    ]);
    if (results.some((result) => !result.success)) throw new Error("散排牌谱保存失败");
    return;
  }
  await cacheCasualLog(log);
  await writeLocalRecords([...(await localRecords()), record]);
}

export async function deleteCasualRecord(id: string) {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const target = await getCasualRecord(id);
    if (!target) return false;
    const result = await db.prepare("DELETE FROM casual_matches WHERE id = ?").bind(id).run();
    if (result.meta.changes !== 1) return false;
    // 牌谱记录被删除后，没有被其他散排记录引用的牌谱原文也一并清掉。
    const remaining = await listCasualRecords();
    const used = new Set(remaining.map((record) => record.tenhouLogId));
    if (!used.has(target.tenhouLogId)) await db.prepare("DELETE FROM casual_logs WHERE id = ?").bind(target.tenhouLogId).run();
    return true;
  }
  const records = await localRecords();
  const target = records.find((record) => record.id === id);
  if (!target) return false;
  const remaining = records.filter((record) => record.id !== id);
  await writeLocalRecords(remaining);
  if (!remaining.some((record) => record.tenhouLogId === target.tenhouLogId)) {
    await fs.rm(path.join(logsDirectory, `${target.tenhouLogId}.json`), { force: true });
  }
  return true;
}

export async function readCasualLog(logId: string): Promise<TenhouLog | null> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT document FROM casual_logs WHERE id = ?").bind(logId).first<{ document: string }>();
    if (!row) return null;
    try {
      return validateTenhouLog(JSON.parse(row.document), logId);
    } catch {
      return null;
    }
  }
  try {
    const value = JSON.parse(await fs.readFile(path.join(logsDirectory, `${logId}.json`), "utf8"));
    return validateTenhouLog(value, logId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readCasualLogs(logIds: string[]) {
  const logs = new Map<string, TenhouLog>();
  await Promise.all([...new Set(logIds)].map(async (logId) => {
    const log = await readCasualLog(logId);
    if (log) logs.set(logId, log);
  }));
  return logs;
}

/**
 * 散排统计的缓存版本：只跟散排自己的表有关，录散排不会让比赛统计快照失效。
 */
export async function casualDataVersion() {
  if (!usesD1Storage()) return `local|${SNAPSHOT_REVISION}`;
  try {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT COALESCE(MAX(created_at), '') AS casualUpdatedAt, COUNT(*) AS casualCount FROM casual_matches")
      .first<Record<string, string | number>>();
    return [String(SNAPSHOT_REVISION), row?.casualUpdatedAt ?? "", row?.casualCount ?? ""].join("|");
  } catch {
    return `unavailable|${SNAPSHOT_REVISION}|${Date.now()}`;
  }
}
