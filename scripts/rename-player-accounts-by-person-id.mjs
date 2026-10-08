#!/usr/bin/env node
// 把选手账号改回「人物唯一标识 personId」，密码保持不变。
// personId 是全局人物库主键，跨赛事唯一且稳定；其中 8 个人是纯英文，登录不用切输入法。
//
// 用法：
//   node scripts/rename-player-accounts-by-person-id.mjs --dry-run
//   node scripts/rename-player-accounts-by-person-id.mjs --passwords-from <上一次的交付文件>

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const dryRun = process.argv.includes("--dry-run");
const passwordsFromIndex = process.argv.indexOf("--passwords-from");
const passwordsFrom = passwordsFromIndex > -1 ? process.argv[passwordsFromIndex + 1] : null;

function sqlValue(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

/** 与 src/domain/app-user.ts 的 normalizeUsername 保持一致。 */
function normalizeUsername(value) {
  return value.trim().normalize("NFC").toLowerCase();
}

function query(command) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", command], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.slice(output.indexOf("["))).flatMap((entry) => entry.results ?? []);
}

const rows = query(
  "SELECT u.id, u.username, u.person_id, u.role, json_extract(p.document, '$.displayName') AS personName "
  + "FROM app_users u JOIN people p ON p.id = u.person_id ORDER BY u.person_id",
);
const players = rows.filter((row) => row.role !== "admin");
if (!players.length) throw new Error("没有找到选手账号");

// personId 唯一，且不能和另一个人的现有账号重名（COLLATE NOCASE UNIQUE）。
const targets = new Map();
for (const row of players) {
  const target = String(row.person_id);
  if (target.length < 2 || target.length > 32) throw new Error(`personId「${target}」长度不合法`);
  if (/[\s\u0000-\u001f/\\:@?#]/u.test(target)) throw new Error(`personId「${target}」含有不能做账号的字符`);
  const key = normalizeUsername(target);
  if (targets.has(key)) throw new Error(`personId「${target}」和「${targets.get(key).target}」重名`);
  targets.set(key, { row, target });
}

const currentKeys = new Set(rows.map((row) => normalizeUsername(row.username)));
for (const { row, target } of targets.values()) {
  const clash = rows.find((other) => other.id !== row.id && normalizeUsername(other.username) === normalizeUsername(target));
  if (clash) throw new Error(`personId「${target}」和账号「${clash.username}」冲突（分两步改名可避免，脚本已按此处理）`);
}

const renames = [...targets.values()].map(({ row, target }) => ({
  id: row.id,
  oldUsername: row.username,
  username: target,
  personName: String(row.personName),
  changed: normalizeUsername(row.username) !== normalizeUsername(target),
}));

console.log(`找到 ${rows.length} 个账号（admin 不在 app_users 内，不受影响），准备按 personId 改名：\n`);
for (const item of renames) {
  console.log(`  ${item.changed ? "改名" : "不变"}  ${item.oldUsername} -> ${item.username}   人物：${item.personName}`);
}
console.log(`\n实际需要改动：${renames.filter((item) => item.changed).length} / ${renames.length}`);

if (dryRun) {
  console.log("\n（--dry-run，未写库）");
  process.exit(0);
}
if (!passwordsFrom) {
  console.log("\n需要 --passwords-from <上一次的交付文件>，否则无法重建含密码的交付文件。");
  process.exit(1);
}

// 上一次交付文件里的密码原样搬过来，密码不变。
const previous = new Map();
for (const line of fs.readFileSync(passwordsFrom, "utf8").split("\n")) {
  if (!line.includes("\t")) continue;
  const [username, password] = line.split("\t");
  previous.set(normalizeUsername(username), password);
}

// 两步改名：先挪到占位名，再落真名，避开 COLLATE NOCASE UNIQUE 中途撞车。
const now = new Date().toISOString();
const statements = [
  ...renames.map((item) =>
    `UPDATE app_users SET username = ${sqlValue(`__renaming__${item.id}`)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(item.id)};`),
  ...renames.map((item) =>
    `UPDATE app_users SET username = ${sqlValue(item.username)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(item.id)};`),
];

const sqlFile = path.join(projectRoot, "backups", ".rename-player-accounts.sql");
fs.writeFileSync(sqlFile, `${statements.join("\n")}\n`);
try {
  execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
} finally {
  fs.rmSync(sqlFile, { force: true });
}

const missing = renames.filter((item) => !previous.has(normalizeUsername(item.username)) && !previous.has(normalizeUsername(item.oldUsername)));
if (missing.length) throw new Error(`交付文件里找不到这些人的密码：${missing.map((item) => item.username).join("、")}`);

const stamp = now.slice(0, 10);
const delivery = path.join(projectRoot, "secrets", `player-accounts-${stamp}.txt`);
fs.writeFileSync(delivery, [
  `选手账号（${stamp} 生成，账号=人物ID，密码未变）`,
  "登录地址：https://riichi-tournament-manager.pages.dev/login",
  "账号是人物 ID，登录不区分大小写；8 位选手的账号是纯英文，不用切输入法。",
  "",
  ...renames.map((item) => `${item.username}\t${previous.get(normalizeUsername(item.username)) ?? previous.get(normalizeUsername(item.oldUsername))}`),
  "",
].join("\n"), { mode: 0o600 });
fs.chmodSync(delivery, 0o600);

console.log(`\n已写入云端 D1，密码未改动。`);
console.log(`交付文件：${path.relative(projectRoot, delivery)}（权限 600）`);
