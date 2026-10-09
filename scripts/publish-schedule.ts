#!/usr/bin/env node
// 正式发布个人赛赛程：
//   1) 把当前赛程导出成一份带指纹的备份文件；
//   2) 在赛事上打 schedulePublishedAt 标记，之后重排脚本会拒绝自动改写。
//
// 用法：npx vite-node scripts/publish-schedule.ts [--remote] [--dry-run]

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { individualWeekOf } from "../src/domain/individual-standings";
import type { Competition } from "../src/domain/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const remote = process.argv.includes("--remote");
const dryRun = process.argv.includes("--dry-run");

function sqlValue(value: string) { return `'${value.replaceAll("'", "''")}'`; }

type ResultRow = { id: string; document: string };
function query(command: string) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", command], {
    cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output.slice(output.indexOf("["))) as Array<{ results?: ResultRow[] }>;
  return parsed.flatMap((entry) => entry.results ?? []);
}

/** 赛程指纹：只看桌次标识、时间与四个人，和成绩、协商记录无关。 */
export function scheduleFingerprint(competition: Competition) {
  const skeleton = (competition.individualSchedule ?? [])
    .map((table) => [table.id, table.scheduledAt, [...table.participantIds].sort().join(",")].join("@"))
    .sort()
    .join("\n");
  return crypto.createHash("sha256").update(skeleton).digest("hex").slice(0, 16);
}

const beijing = (iso: string) => new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

for (const row of query("SELECT id, document FROM competitions WHERE json_extract(document,'$.format')='individual'")) {
  const competition = JSON.parse(row.document) as Competition;
  const tables = competition.individualSchedule ?? [];
  if (!tables.length) { console.log(`${competition.name}：还没有赛程，跳过`); continue; }

  const fingerprint = scheduleFingerprint(competition);
  const first = tables.reduce((min, table) => (table.scheduledAt < min ? table.scheduledAt : min), tables[0].scheduledAt);
  const last = tables.reduce((max, table) => (table.scheduledAt > max ? table.scheduledAt : max), tables[0].scheduledAt);
  const now = new Date().toISOString();

  console.log(`${competition.name}（${competition.id}）`);
  console.log(`  桌次 ${tables.length} · 选手 ${competition.participants.length} 人`);
  console.log(`  时间跨度 ${beijing(first)} ~ ${beijing(last)}`);
  console.log(`  周次范围 ${Math.min(...tables.map(individualWeekOf))} ~ ${Math.max(...tables.map(individualWeekOf))}`);
  console.log(`  指纹 ${fingerprint}`);
  if (competition.schedulePublishedAt) console.log(`  已发布于 ${beijing(competition.schedulePublishedAt)}，指纹 ${competition.schedulePublishedSummary?.fingerprint ?? "无"}`);

  competition.schedulePublishedAt = now;
  competition.schedulePublishedSummary = {
    tables: tables.length,
    participants: competition.participants.length,
    firstTableAt: first,
    lastTableAt: last,
    fingerprint,
  };

  const backupDir = path.join(projectRoot, "backups", "published-schedules");
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `${competition.id}-${now.slice(0, 10)}-${fingerprint}.json`);
  fs.writeFileSync(file, `${JSON.stringify({
    publishedAt: now,
    competitionId: competition.id,
    competitionName: competition.name,
    fingerprint,
    summary: competition.schedulePublishedSummary,
    // 完整留档：参赛者、设置、全部桌次，连协商记录一起存，之后能原样还原。
    document: competition,
  }, null, 2)}\n`);
  console.log(`  备份已写出：${path.relative(projectRoot, file)}`);

  if (dryRun || !remote) continue;
  const sqlFile = path.join(backupDir, ".publish.sql");
  fs.writeFileSync(sqlFile, `UPDATE competitions SET document = ${sqlValue(JSON.stringify(competition))}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(competition.id)};\n`);
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
    console.log("  已写入云端 D1");
  } finally {
    fs.rmSync(sqlFile, { force: true });
  }
}

if (dryRun || !remote) console.log("\n（未加 --remote 或 --dry-run，未写库）");
