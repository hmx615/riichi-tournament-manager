#!/usr/bin/env node
// 把个人赛的每日第二场从 21:30 改成 21:00，并按新时间重算已排好的桌次。
// 同时把协商窗口改成「上一周周日/周三 22:00」的口径（时间窗是读代码算的，不用落库）。
//
// 用法：npx vite-node scripts/migrate-legal-times.ts [--remote] [--dry-run]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { individualSettingsFor } from "../src/domain/competition-format";
import { individualTableTime } from "../src/domain/individual-tournament";
import { individualWeekOf } from "../src/domain/individual-standings";
import type { Competition } from "../src/domain/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const remote = process.argv.includes("--remote");
const dryRun = process.argv.includes("--dry-run");

function sqlValue(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(command: string) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", command], {
    cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  type ResultRow = { id: string; document: string };
  const parsed = JSON.parse(output.slice(output.indexOf("["))) as Array<{ results?: ResultRow[] }>;
  return parsed.flatMap((entry: { results?: ResultRow[] }) => entry.results ?? []);
}

const beijing = (iso: string) => new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

for (const row of query("SELECT id, document FROM competitions WHERE json_extract(document,'$.format')='individual'")) {
  const competition = JSON.parse(row.document) as Competition;
  const settings = individualSettingsFor(competition)!;
  const before = [...(settings.preliminary.legalTimes ?? [])];
  settings.preliminary.legalTimes = ["20:00", "21:00"];
  competition.individualSettings = settings;

  let changed = 0;
  for (const table of competition.individualSchedule ?? []) {
    const next = individualTableTime(settings.preliminary.startDate ?? new Date().toISOString().slice(0, 10), individualWeekOf(table), table.round, settings);
    if (next !== table.scheduledAt) {
      table.scheduledAt = next;
      // 法定时间也跟着走，协商页显示的「法定时间」才是准的。
      if (table.negotiation?.legalTime) table.negotiation.legalTime = next;
      changed += 1;
    }
  }
  console.log(`${competition.name}（${competition.id}）`);
  console.log(`  每日开赛时间：${before.join(" / ")} -> ${settings.preliminary.legalTimes!.join(" / ")}`);
  console.log(`  重算桌次：${changed} / ${(competition.individualSchedule ?? []).length}`);
  const sample = (competition.individualSchedule ?? []).filter((t) => individualWeekOf(t) === 1).slice(0, 2);
  for (const table of sample) console.log(`    ${table.id} -> ${beijing(table.scheduledAt)}`);
  if (dryRun || !remote) continue;

  const sqlFile = path.join(projectRoot, "backups", ".migrate-legal-times.sql");
  fs.writeFileSync(sqlFile,
    `UPDATE competitions SET document = ${sqlValue(JSON.stringify(competition))}, updated_at = ${sqlValue(new Date().toISOString())} WHERE id = ${sqlValue(competition.id)};\n`);
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
    console.log("  已写入云端 D1");
  } finally {
    fs.rmSync(sqlFile, { force: true });
  }
}

if (dryRun || !remote) console.log("\n（未加 --remote 或 --dry-run，未写库）");
