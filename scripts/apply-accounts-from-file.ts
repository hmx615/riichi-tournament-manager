#!/usr/bin/env node
// 按交付文件里的账号名重建选手账号，密码保持不变。
//
// 关键点：不用「第 N 行对应第 N 个人」这种脆弱映射，而是拿每行的密码去
// 校验线上哈希来定位到底是哪个账号——你就算调了顺序、插了空行也不会错配，
// 密码写错则直接报错，不会静默改错人。
//
// 用法：
//   npx vite-node scripts/apply-accounts-from-file.ts <交付文件> --dry-run
//   npx vite-node scripts/apply-accounts-from-file.ts <交付文件>

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { verifyAppUserPassword, normalizeUsername } from "../src/domain/app-user";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!file || file.startsWith("--")) throw new Error("用法：npx vite-node scripts/apply-accounts-from-file.ts <交付文件> [--dry-run]");

/** 账号必须是纯 ASCII：现场用手机登录不用切输入法。 */
const asciiOnly = /^[A-Za-z0-9_]{2,32}$/;

function sqlValue(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", "SELECT id, username, password_hash, role FROM app_users"], {
  cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
});
type Row = { id: string; username: string; password_hash: string; role: string };
const rows: Row[] = (JSON.parse(output.slice(output.indexOf("["))) as Array<{ results?: Row[] }>)
  .flatMap((entry) => entry.results ?? []);
const players = rows.filter((row) => row.role !== "admin");

// 读文件：每行「账号<TAB>密码」。
const entries: Array<{ username: string; password: string }> = [];
for (const line of fs.readFileSync(path.resolve(file), "utf8").split("\n")) {
  if (!line.includes("\t")) continue;
  const [username, ...rest] = line.split("\t");
  entries.push({ username: username.trim(), password: rest.join("\t").trim() });
}
if (!entries.length) throw new Error(`文件里没读到「账号<TAB>密码」的条目：${file}`);

// 用密码定位账号：谁的文件里写着谁的密码，就对应线上哪个账号。
const used = new Set<string>();
const plan: Array<{ id: string; oldUsername: string; username: string }> = [];
for (const entry of entries) {
  const candidates = players.filter((row) => !used.has(row.id));
  const hits: Row[] = [];
  // 逐个校验：PBKDF2 是有意做慢的，串行即可，16 个账号不差这点时间。
  for (const row of candidates) {
    if (await verifyAppUserPassword(entry.password, row.password_hash)) hits.push(row);
    if (hits.length > 1) break;
  }
  if (hits.length === 0) throw new Error(`账号「${entry.username}」的密码在线上找不到对应的人，请检查是不是把密码改错了`);
  if (hits.length > 1) throw new Error(`账号「${entry.username}」的密码匹配到多个线上账号，无法确定`);
  used.add(hits[0].id);
  plan.push({ id: hits[0].id, oldUsername: hits[0].username, username: entry.username });
}
const missing = players.filter((row) => !used.has(row.id));
if (missing.length) throw new Error(`文件里少了这些线上账号：${missing.map((row) => row.username).join("、")}`);

// 校验新账号名：纯 ASCII、唯一、且不和别人撞名。
const seen = new Map<string, string>();
for (const item of plan) {
  if (!asciiOnly.test(item.username)) throw new Error(`账号「${item.username}」含有非 ASCII 字符或长度不合规，只允许 2-32 位字母/数字/下划线`);
  const key = normalizeUsername(item.username);
  const clash = seen.get(key);
  if (clash) throw new Error(`账号「${item.username}」和「${clash}」登录后重名`);
  seen.set(key, item.username);
}
for (const item of plan) {
  const other = rows.find((row) => row.id !== item.id && normalizeUsername(row.username) === normalizeUsername(item.username));
  if (other) throw new Error(`账号「${item.username}」和线上账号「${other.username}」冲突`);
}

const changed = plan.filter((item) => normalizeUsername(item.oldUsername) !== normalizeUsername(item.username));
console.log(`文件 ${path.basename(file)}：${entries.length} 条，用密码定位到 ${plan.length} 个线上账号（匹配无误）\n`);
for (const item of plan) {
  const mark = normalizeUsername(item.oldUsername) === normalizeUsername(item.username) ? "不变" : "改名";
  console.log(`  ${mark}  ${item.oldUsername} -> ${item.username}`);
}
console.log(`\n需要改名：${changed.length} / ${plan.length}；全部为纯 ASCII 账号名。`);

if (dryRun) {
  console.log("\n（--dry-run，未写库）");
  process.exit(0);
}

// 两步改名避开 COLLATE NOCASE UNIQUE 中途撞车。
const now = new Date().toISOString();
const statements = [
  ...plan.map((item) => `UPDATE app_users SET username = ${sqlValue("__renaming__" + item.id)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(item.id)};`),
  ...plan.map((item) => `UPDATE app_users SET username = ${sqlValue(item.username)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(item.id)};`),
];
const sqlFile = path.join(projectRoot, "backups", ".apply-accounts-from-file.sql");
fs.writeFileSync(sqlFile, statements.join("\n") + "\n");
try {
  execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
} finally {
  fs.rmSync(sqlFile, { force: true });
}

console.log("\n已写入云端 D1，密码未改动。");
