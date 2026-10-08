#!/usr/bin/env node
// 创建第一届启明杯个人赛：16 人、4 周日常周 + 3 周淘汰周 + 4 人 12 半庄决赛。
// 开赛时一次排完日常周（第 1–4 周）赛程；淘汰周的桌次等每周结算淘汰名单后再生成。
// 用法：npx vite-node scripts/create-qiming-competition.ts [--remote]
//   --remote  写入云端 D1（默认只打印，不落库）

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Competition, IndividualCompetitionSettings, Participant, Person } from "../src/domain/types";
import { planPreliminaryRegularWeeks } from "../src/domain/individual-tournament";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const remote = process.argv.includes("--remote");

const competitionId = "1st-qm";
const competitionName = "第一届启明杯";
const competitionCode = "1ST-QM";
const rosterTag = "启明杯个人赛";
const startDate = "2026-10-11";

const settings: IndividualCompetitionSettings = {
  preliminary: {
    regularWeeks: 4,
    eliminationWeeks: 3,
    matchesPerPlayerPerWeek: 4,
    eliminationCountPerWeek: 4,
    finalistCount: 4,
    legalWeekdays: [0, 3],
    legalTimes: ["20:00", "21:30"],
    startDate,
  },
  final: { matchCountPerPlayer: 12 },
  pairingMode: "balanced_opponents",
};

const palette = [
  "#d1495b", "#168f83", "#6657c7", "#d58a18", "#4e8fc5", "#9c5f9c", "#4d9b73", "#b56a3b",
  "#c2456b", "#2f8f9d", "#7a5bd6", "#c07020", "#3c76b5", "#8c6bb1", "#5b9a8b", "#a8552f",
];

function sqlValue(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function query<T>(command: string): T[] {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", command], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output.slice(output.indexOf("["))) as Array<{ results?: T[] }>;
  return parsed.flatMap((entry) => entry.results ?? []);
}

const rows = query<{ document: string }>(
  `SELECT document FROM people WHERE EXISTS (SELECT 1 FROM json_each(people.document,'$.tags') WHERE value='${rosterTag}')`,
);
const people = rows.map((row) => JSON.parse(row.document) as Person)
  .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN"));
if (people.length !== 16) throw new Error(`标签「${rosterTag}」下有 ${people.length} 人，本届需要 16 人`);

const participants: Participant[] = people.map((person, index) => ({
  id: `player-${index + 1}`,
  personId: person.id,
  displayName: person.displayName,
  kind: person.kind,
  color: palette[index % palette.length],
  usernames: [...new Set([person.displayName, ...(person.aliases ?? []), ...(person.accounts ?? []).map((account) => account.username)])],
}));

const competition: Competition = {
  id: competitionId,
  name: competitionName,
  code: competitionCode,
  format: "individual",
  status: "active",
  plannedMatchCount: 112,
  initialPoints: 25000,
  rankPoints: [30, 10, -10, -30],
  participants,
  matches: [],
  individualSettings: settings,
};
const regular = planPreliminaryRegularWeeks(competition, settings);
competition.individualSchedule = regular.tables;
if (regular.byes.length) competition.individualByes = regular.byes;

console.log(`比赛：${competitionName}（${competitionId}）`);
console.log(`选手 ${participants.length} 人：${participants.map((participant) => participant.displayName).join("、")}`);
console.log(`日常周桌次 ${competition.individualSchedule.length} 桌`);
console.log(`第一周前两桌时间：${competition.individualSchedule.slice(0, 2).map((table) => `${table.scheduledAt}`).join(" / ")}`);

const now = new Date().toISOString();
const statement = `INSERT INTO competitions (id, document, version, created_at, updated_at) VALUES (`
  + [sqlValue(competition.id), sqlValue(JSON.stringify(competition)), "1", sqlValue(now), sqlValue(now)].join(", ")
  + ");";

const backupFile = path.join(projectRoot, "backups", `qiming-competition-${startDate}.json`);
fs.mkdirSync(path.dirname(backupFile), { recursive: true });
fs.writeFileSync(backupFile, `${JSON.stringify(competition, null, 2)}\n`);
console.log(`已写出草稿：${path.relative(projectRoot, backupFile)}`);

if (!remote) {
  console.log("\n（未加 --remote，未写入数据库）");
  process.exit(0);
}

const sqlFile = path.join(projectRoot, "backups", ".create-qiming-competition.sql");
fs.writeFileSync(sqlFile, `${statement}\n`);
try {
  execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
} finally {
  fs.rmSync(sqlFile, { force: true });
}
console.log("\n已写入云端 D1。");
