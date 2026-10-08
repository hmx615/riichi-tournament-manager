#!/usr/bin/env node
// 按「同一天同桌固定」的新规则重排个人赛日常周赛程。
// 已有牌谱成绩会保留；协商记录会清掉（换人对桌后旧的确认不再对应）。
//
// 用法：npx vite-node scripts/regenerate-preliminary-schedule.ts [--remote] [--dry-run]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { individualSettingsFor } from "../src/domain/competition-format";
import { opponentPairCounts } from "../src/domain/individual-schedule";
import { planPreliminaryRegularWeeks } from "../src/domain/individual-tournament";
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

for (const row of query("SELECT id, document FROM competitions WHERE json_extract(document,'$.format')='individual'")) {
  const competition = JSON.parse(row.document) as Competition;
  const settings = individualSettingsFor(competition)!;
  const before = competition.individualSchedule ?? [];
  const recorded = competition.matches.filter((match) => match.status === "completed").length;
  if (recorded > 0) throw new Error(`${competition.name} 已经有 ${recorded} 场成绩，重排会让成绩对不上桌次，先处理掉`);

  const regular = planPreliminaryRegularWeeks(competition, settings);
  // 只替换日常周（week <= regularWeeks）的桌次；淘汰周和决赛还没生成。
  const keep = before.filter((table) => individualWeekOf(table) > settings.preliminary.regularWeeks);
  competition.individualSchedule = [...regular.tables, ...keep].sort(
    (a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.round - b.round || a.tableNumber - b.tableNumber,
  );
  competition.individualEliminations = [];

  console.log(`${competition.name}（${competition.id}）`);
  console.log(`  桌次：${before.length} -> ${competition.individualSchedule.length}`);

  // 同一天两轮同桌是否一致
  const byRound = new Map<string, string[]>();
  for (const table of competition.individualSchedule) {
    const key = `${individualWeekOf(table)}-${table.round}`;
    if (!byRound.has(key)) byRound.set(key, []);
    byRound.get(key)!.push([...table.participantIds].sort().join(","));
  }
  let mismatch = 0;
  for (let week = 1; week <= settings.preliminary.regularWeeks; week += 1) {
    const a = (byRound.get(`${week}-1`) ?? []).sort().join("|");
    const b = (byRound.get(`${week}-2`) ?? []).sort().join("|");
    if (a !== b) mismatch += 1;
  }
  console.log(`  同一天两轮同桌一致：${mismatch === 0 ? "全部一致" : `${mismatch} 周不一致`}`);

  // 对手相遇次数统计
  const counts = Object.values(opponentPairCounts(competition.individualSchedule));
  const dist = new Map<number, number>();
  for (const value of counts) dist.set(value, (dist.get(value) ?? 0) + 1);
  console.log(`  对手相遇次数（共 ${counts.length} 对不同对手）：`);
  for (const [times, pairs] of [...dist].sort((x, y) => x[0] - y[0])) console.log(`    ${times} 次：${pairs} 对`);
  console.log(`    平均 ${(counts.reduce((s, v) => s + v, 0) / counts.length).toFixed(2)} 次，最多 ${Math.max(...counts)} 次`);

  if (dryRun || !remote) continue;
  const sqlFile = path.join(projectRoot, "backups", ".regenerate-schedule.sql");
  fs.writeFileSync(sqlFile, `UPDATE competitions SET document = ${sqlValue(JSON.stringify(competition))}, updated_at = ${sqlValue(new Date().toISOString())} WHERE id = ${sqlValue(competition.id)};\n`);
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
    console.log("  已写入云端 D1");
  } finally {
    fs.rmSync(sqlFile, { force: true });
  }
}

if (dryRun || !remote) console.log("\n（未加 --remote 或 --dry-run，未写库）");
