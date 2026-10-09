#!/usr/bin/env node
// 把比赛里参赛席位的显示名，同步成人物库当前的昵称。
//
// 背景：参赛席位的 displayName 是建赛时从人物库拷进来的快照，选手后来在
// 「我的资料」改了昵称，比赛里不会自动跟着变，比赛详情页会出现新旧两个名字。
// 这里只改 displayName，不动 personId、标签、绑定关系和任何成绩。
//
// 用法：npx vite-node scripts/sync-competition-names.ts [比赛id] [--remote] [--dry-run]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Competition } from "../src/domain/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const remote = process.argv.includes("--remote");
const dryRun = process.argv.includes("--dry-run");
const onlyId = process.argv.slice(2).find((value) => !value.startsWith("--"));

function sqlValue(value: string) { return `'${value.replaceAll("'", "''")}'`; }

type Row = { id: string; document: string };
function query(command: string): Row[] {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", command], {
    cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output.slice(output.indexOf("["))) as Array<{ results?: Row[] }>;
  return parsed.flatMap((entry) => entry.results ?? []);
}

const people = new Map(query("SELECT id, document FROM people")
  .map((row) => [row.id, JSON.parse(row.document) as { displayName: string }]));

const filter = onlyId ? ` WHERE id = ${sqlValue(onlyId)}` : "";
const changed = 0;
let total = 0;
const statements: string[] = [];

for (const row of query(`SELECT id, document FROM competitions${filter}`)) {
  const competition = JSON.parse(row.document) as Competition;
  const updates: string[] = [];
  const lines: string[] = [];
  for (const participant of competition.participants) {
    if (!participant.personId) continue;
    const person = people.get(participant.personId);
    if (!person || person.displayName === participant.displayName) continue;
    updates.push(`${participant.id}: ${participant.displayName} -> ${person.displayName}`);
    lines.push(`    ${participant.displayName} -> ${person.displayName}`);
    participant.displayName = person.displayName;
  }
  if (!updates.length) continue;
  total += updates.length;
  console.log(`${competition.name}（${competition.id}）：${updates.length} 人`);
  for (const line of lines) console.log(line);
  statements.push(`UPDATE competitions SET document = ${sqlValue(JSON.stringify(competition))}, updated_at = ${sqlValue(new Date().toISOString())} WHERE id = ${sqlValue(competition.id)};`);
}

if (!statements.length) {
  console.log("\n所有比赛的参赛席位昵称都已和人物库一致，不用改。");
  process.exit(0);
}
console.log(`\n共需同步 ${total} 人次。`);
if (dryRun || !remote) {
  console.log("（未加 --remote 或 --dry-run，未写库）");
  process.exit(0);
}

const sqlFile = path.join(projectRoot, "backups", ".sync-competition-names.sql");
fs.writeFileSync(sqlFile, `${statements.join("\n")}\n`);
try {
  execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
  console.log("已写入云端 D1");
} finally {
  fs.rmSync(sqlFile, { force: true });
}
