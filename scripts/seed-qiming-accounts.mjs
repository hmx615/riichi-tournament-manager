#!/usr/bin/env node
// 为「启明杯个人赛」标签下还没有账号的选手补建登录账号（选手用账号进赛程确认页）。
// 密码随机生成，只在命令行打印一次。
// 用法：node scripts/seed-qiming-accounts.mjs [--remote] [--dry-run]
//   --remote   写入云端 D1
//   --dry-run  只打印将要创建的账号

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const remote = process.argv.includes("--remote");
const dryRun = process.argv.includes("--dry-run");
const rosterTag = "启明杯个人赛";

/** 还缺账号的 7 位选手（其余 9 位在上一批已经建好）。 */
const accounts = [
  { username: "sanq", personId: "3q", displayName: "3q" },
  { username: "traaaaa", personId: "Traaaaa", displayName: "Traaaaa" },
  { username: "wesley", personId: "Wesley", displayName: "Wesley" },
  { username: "aniya", personId: "aniya", displayName: "おでけけ" },
  { username: "luanhua", personId: "乱花", displayName: "乱花" },
  { username: "doraemon", personId: "Doraemon", displayName: "叮当" },
  { username: "heart", personId: "heart", displayName: "心脏会闪烁吗" },
];

const passwordAlphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const iterations = 60000;

function sqlValue(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

function encodeBase64Url(buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function generatePassword(length = 10) {
  return [...crypto.randomBytes(length)].map((byte) => passwordAlphabet[byte % passwordAlphabet.length]).join("");
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const digest = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2-sha256$${iterations}$${encodeBase64Url(salt)}$${encodeBase64Url(digest)}`;
}

function query(command) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", command], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.slice(output.indexOf("["))).flatMap((entry) => entry.results ?? []);
}

const roster = new Set(query(`SELECT id FROM people WHERE EXISTS (SELECT 1 FROM json_each(people.document,'$.tags') WHERE value='${rosterTag}')`).map((row) => row.id));
const taken = new Set(query("SELECT username FROM app_users").map((row) => String(row.username).toLowerCase()));

for (const account of accounts) {
  if (!roster.has(account.personId)) throw new Error(`「${rosterTag}」名单里没有 ${account.personId}（${account.displayName}）`);
}

const now = new Date().toISOString();
const created = accounts
  .filter((account) => !taken.has(account.username))
  .map((account) => ({ ...account, id: crypto.randomUUID(), password: generatePassword() }));
const skipped = accounts.filter((account) => taken.has(account.username)).map((account) => account.username);

if (dryRun) {
  console.log(created.map((item) => `${item.username}\t${item.displayName}\t（未写入）`).join("\n") || "没有需要创建的账号");
  if (skipped.length) console.log(`已存在跳过：${skipped.join("、")}`);
  process.exit(0);
}

if (created.length && remote) {
  const statements = created.map((item) => "INSERT INTO app_users (id, username, display_name, person_id, role, password_hash, created_at, updated_at, last_login_at) VALUES ("
    + [sqlValue(item.id), sqlValue(item.username), sqlValue(item.displayName), sqlValue(item.personId), sqlValue("player"), sqlValue(hashPassword(item.password)), sqlValue(now), sqlValue(now), "NULL"].join(", ")
    + ");").join("\n");
  const temporary = path.join(projectRoot, "backups", ".seed-qiming-users.sql");
  fs.mkdirSync(path.dirname(temporary), { recursive: true });
  fs.writeFileSync(temporary, `${statements}\n`);
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${temporary}`], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

console.log(`\n新建账号 ${created.length} 个${remote ? "（云端 D1）" : "（未写库，请加 --remote）"}${skipped.length ? `，已存在跳过 ${skipped.join("、")}` : ""}\n`);
if (created.length) {
  console.log("账号\t选手\t密码");
  for (const item of created) console.log(`${item.username}\t${item.displayName}\t${item.password}`);
  console.log("\n以上密码只显示这一次，请尽快转交本人。");
}
