#!/usr/bin/env node
// 把云端 D1 的数据下载回本地 data/ 目录，作为本地缓存与离线备份。
// 用法：node scripts/sync-from-d1.mjs [--database riichi-tournament-manager]

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const databaseFlagIndex = process.argv.indexOf("--database");
const database = databaseFlagIndex === -1 ? "riichi-tournament-manager" : process.argv[databaseFlagIndex + 1];

const projectRoot = path.resolve(import.meta.dirname, "..");
const dataDirectory = process.env.DATA_DIRECTORY
  ? path.resolve(process.env.DATA_DIRECTORY)
  : path.join(projectRoot, "data");

function queryOnce(sql) {
  return execFileSync(
    "npx",
    ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", sql],
    { cwd: projectRoot, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
}

function query(sql, attempts = 4) {
  let raw = "";
  for (let attempt = 1; ; attempt += 1) {
    try {
      raw = queryOnce(sql);
      break;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const wait = attempt * 3000;
      console.warn(`查询失败（第 ${attempt} 次），${wait / 1000}s 后重试：${sql.slice(0, 40)}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  const start = raw.indexOf("[");
  if (start === -1) throw new Error(`无法解析 wrangler 输出：${raw.slice(0, 400)}`);
  const parsed = JSON.parse(raw.slice(start));
  const rows = parsed.flatMap((entry) => entry.results ?? []);
  return rows;
}

async function writeJson(relativePath, value) {
  const file = path.join(dataDirectory, relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function decodeBlob(value) {
  if (value == null) return new Uint8Array();
  if (typeof value === "string") return Buffer.from(value, "base64");
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (value.type === "Buffer" && Array.isArray(value.data)) return Uint8Array.from(value.data);
  return Buffer.from(String(value), "base64");
}

async function syncDocuments(table, relativeDirectory, unwrap) {
  const rows = query(`SELECT id, document FROM ${table}`);
  const seen = new Set();
  for (const row of rows) {
    const id = row.id;
    seen.add(`${id}.json`);
    const parsed = JSON.parse(row.document);
    await writeJson(path.join(relativeDirectory, `${id}.json`), unwrap ? unwrap(parsed) : parsed);
  }
  const directory = path.join(dataDirectory, relativeDirectory);
  const existing = await fs.readdir(directory).catch(() => []);
  const removed = [];
  for (const name of existing) {
    if (!name.endsWith(".json") || seen.has(name)) continue;
    await fs.rm(path.join(directory, name));
    removed.push(name);
  }
  console.log(`${table}: 写入 ${rows.length} 条${removed.length ? `，删除本地多余 ${removed.length} 条` : ""}`);
  return rows.length;
}

const summary = {};

summary.competitions = await syncDocuments("competitions", "competitions");

// 牌谱按 id 升序落盘，保持和本地既有文件顺序一致，便于 diff。
const logRows = query("SELECT id, document FROM logs ORDER BY id").sort((a, b) => (a.id < b.id ? -1 : 1));
const seenLogs = new Set();
for (const row of logRows) {
  seenLogs.add(`${row.id}.json`);
  await writeJson(path.join("logs", `${row.id}.json`), JSON.parse(row.document));
}
{
  const directory = path.join(dataDirectory, "logs");
  const existing = await fs.readdir(directory).catch(() => []);
  const removed = [];
  for (const name of existing) {
    if (!name.endsWith(".json") || seenLogs.has(name)) continue;
    await fs.rm(path.join(directory, name));
    removed.push(name);
  }
  console.log(`logs: 写入 ${logRows.length} 条${removed.length ? `，删除本地多余 ${removed.length} 条` : ""}`);
  summary.logs = logRows.length;
}

const peopleRows = query("SELECT id, document FROM people");
// 保持本地既有顺序，新人物追加到末尾，避免无意义的 diff。
const previousPeople = await fs
  .readFile(path.join(dataDirectory, "people.json"), "utf8")
  .then((text) => JSON.parse(text))
  .catch(() => []);
const peopleById = new Map(peopleRows.map((row) => [row.id, JSON.parse(row.document)]));
const people = [];
for (const person of previousPeople) {
  const row = peopleById.get(person.id);
  if (row) {
    people.push(row);
    peopleById.delete(person.id);
  }
}
for (const row of peopleById.values()) people.push(row);
await writeJson("people.json", people);
console.log(`people: 写入 ${people.length} 条`);
summary.people = people.length;

const tutorialRows = query("SELECT id, document FROM tutorial_case_states");
const tutorialStates = {};
for (const row of tutorialRows) tutorialStates[row.id] = JSON.parse(row.document);
await writeJson("tutorial-case-states.json", tutorialStates);
console.log(`tutorial_case_states: 写入 ${tutorialRows.length} 条`);
summary.tutorialCaseStates = tutorialRows.length;

const avatarRows = query("SELECT key, body, content_type FROM avatars");
let avatarCount = 0;
for (const row of avatarRows) {
  const file = path.join(dataDirectory, "avatars", row.key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, decodeBlob(row.body));
  avatarCount += 1;
}
console.log(`avatars: 写入 ${avatarCount} 个文件`);
summary.avatars = avatarCount;

console.log("\n完成，云端数据已同步到", dataDirectory);
console.log(JSON.stringify(summary, null, 2));
