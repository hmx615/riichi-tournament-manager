#!/usr/bin/env node
// 把选手账号改成「排行榜人物名」并重新生成密码：admin 账号不动。
// 密码只在标准输出和 .secrets/ 下的交付文件里出现一次，不入库、不进 git。
//
// 用法：
//   node scripts/reset-player-credentials.mjs --dry-run   只打印将要执行的动作
//   node scripts/reset-player-credentials.mjs             真正写入云端 D1

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const dryRun = process.argv.includes("--dry-run");

const passwordAlphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const iterations = 60000;

function sqlValue(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

function encodeBase64Url(buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function generatePassword(length = 12) {
  return [...crypto.randomBytes(length)].map((byte) => passwordAlphabet[byte % passwordAlphabet.length]).join("");
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const digest = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2-sha256$${iterations}$${encodeBase64Url(salt)}$${encodeBase64Url(digest)}`;
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
  + "FROM app_users u LEFT JOIN people p ON p.id = u.person_id ORDER BY u.username",
);

// admin 账号保持原样：只重置选手。
const players = rows.filter((row) => row.role !== "admin");
const admins = rows.filter((row) => row.role === "admin");

if (!players.length) throw new Error("没有找到选手账号，请确认 D1 里的 app_users 表");

// 新账号名 = 排行榜人物名；同一批里不允许撞名（D1 是 COLLATE NOCASE UNIQUE）。
const seen = new Map();
for (const row of players) {
  const name = String(row.personName ?? "").trim();
  if (!name) throw new Error(`账号 ${row.username} 没有绑定人物，取不到排行榜人物名`);
  const key = normalizeUsername(name);
  if (key.length < 2) throw new Error(`人物名「${name}」太短，不能作为账号`);
  if (seen.has(key)) throw new Error(`人物名「${name}」和「${seen.get(key)}」登录后重名`);
  seen.set(key, name);
}

const now = new Date().toISOString();
const updates = players.map((row) => {
  const username = String(row.personName).trim();
  const password = generatePassword(12);
  return {
    id: row.id,
    oldUsername: row.username,
    username,
    password,
    passwordHash: hashPassword(password),
    personName: String(row.personName),
    personId: row.person_id,
  };
});

console.log(`找到 ${rows.length} 个账号：${admins.length} 个 admin（不动），${players.length} 个选手（重置）`);
for (const admin of admins) console.log(`  admin 保持不变：${admin.username}`);
console.log("");
for (const item of updates) {
  const renamed = normalizeUsername(item.oldUsername) === normalizeUsername(item.username) ? "（同名，仅换密码）" : "";
  console.log(`  ${item.oldUsername}  ->  ${item.username}${renamed}   人物：${item.personName}`);
}

if (dryRun) {
  console.log("\n（--dry-run，未写库、未生成交付文件）");
  process.exit(0);
}

// 先把旧账号名挪开，避免 COLLATE NOCASE UNIQUE 在改名过程中撞车。
const statements = [
  ...updates.map((item) =>
    `UPDATE app_users SET username = ${sqlValue(`__pending__${item.id}`)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(item.id)};`),
  ...updates.map((item) =>
    `UPDATE app_users SET username = ${sqlValue(item.username)}, display_name = ${sqlValue(item.personName)}, password_hash = ${sqlValue(item.passwordHash)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(item.id)};`),
];

const sqlFile = path.join(projectRoot, "backups", ".reset-player-credentials.sql");
fs.mkdirSync(path.dirname(sqlFile), { recursive: true });
fs.writeFileSync(sqlFile, `${statements.join("\n")}\n`);
try {
  execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${sqlFile}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
} finally {
  fs.rmSync(sqlFile, { force: true });
}

// 交付文件：权限 600，密码只在这里出现一次。
const stamp = now.slice(0, 10);
const delivery = path.join(projectRoot, ".secrets", `player-accounts-${stamp}.txt`);
fs.mkdirSync(path.dirname(delivery), { recursive: true });
fs.writeFileSync(delivery, [
  `选手账号（${stamp} 生成，每人一条，转交本人后请勿公开）`,
  "登录地址：https://riichi-tournament-manager.pages.dev/login",
  "账号 = 排行榜上的人物名，密码区分大小写。",
  "",
  ...updates.map((item) => `${item.username}\t${item.password}`),
  "",
].join("\n"), { mode: 0o600 });
fs.chmodSync(delivery, 0o600);

console.log(`\n已写入云端 D1。`);
console.log(`交付文件：${path.relative(projectRoot, delivery)}（权限 600，密码只此一份）`);
