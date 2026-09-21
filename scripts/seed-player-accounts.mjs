#!/usr/bin/env node
// 批量创建选手账号（散排录入用），密码随机生成后只在命令行打印一次。
// 用法：node scripts/seed-player-accounts.mjs [--remote] [--dry-run]
//   --remote   同时写入云端 D1（默认只写本地 data/app-users.json）
//   --dry-run  只打印将创建的账号，不写任何数据

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const dataDirectory = process.env.DATA_DIRECTORY ? path.resolve(process.env.DATA_DIRECTORY) : path.join(projectRoot, "data");
const usersFile = path.join(dataDirectory, "app-users.json");
const database = "riichi-tournament-manager";

const remote = process.argv.includes("--remote");
const dryRun = process.argv.includes("--dry-run");

/** 账号 → 人物 ID（人物 ID 见 data/people.json）。 */
const accounts = [
  { username: "phq", personId: "xiaop", displayName: "彭虹清" },
  { username: "zdh", personId: "Zhao_dehua", displayName: "赵得华" },
  { username: "wyy", personId: "humiao", displayName: "胡米奥" },
  { username: "ljw", personId: "纪委", displayName: "乌蒙一号机" },
  { username: "lxh", personId: "hamburger", displayName: "李晓赫" },
  { username: "cl", personId: "chenluo", displayName: "陈洛" },
  { username: "zsq", personId: "士强", displayName: "九条嘟嘟嘟" },
  { username: "wdj", personId: "wu-dongjie", displayName: "吴东杰" },
  { username: "ezy", personId: "e-ziyi", displayName: "鄂子懿" },
];

const passwordAlphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const iterations = 60000;

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

function sqlValue(value) {
  return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

function localUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users) {
  fs.mkdirSync(path.dirname(usersFile), { recursive: true });
  fs.writeFileSync(usersFile, `${JSON.stringify(users, null, 2)}\n`);
}

function existingUsernames() {
  const names = new Set(localUsers().map((user) => String(user.username).toLowerCase()));
  if (remote) {
    try {
      const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json",
        "--command", "SELECT username FROM app_users"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const parsed = JSON.parse(output.slice(output.indexOf("[")));
      for (const row of parsed.flatMap((entry) => entry.results ?? [])) names.add(String(row.username).toLowerCase());
    } catch (error) {
      console.warn(`读取云端账号失败，将按本地情况处理：${String(error).slice(0, 120)}`);
    }
  }
  return names;
}

function main() {
  const people = JSON.parse(fs.readFileSync(path.join(dataDirectory, "people.json"), "utf8"));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  for (const account of accounts) {
    if (!peopleById.has(account.personId)) throw new Error(`人物池里没有 ${account.personId}（${account.displayName}），请检查 data/people.json`);
  }

  const taken = existingUsernames();
  const now = new Date().toISOString();
  const created = [];
  const skipped = [];
  for (const account of accounts) {
    if (taken.has(account.username)) {
      skipped.push(account.username);
      continue;
    }
    created.push({
      ...account,
      id: crypto.randomUUID(),
      password: generatePassword(),
    });
  }

  if (dryRun) {
    console.log(created.map((item) => `${item.username}\t${item.personId}\t（未写入）`).join("\n") || "没有需要创建的账号");
    return;
  }

  if (created.length) {
    const users = [...localUsers(), ...created.map((item) => ({
      id: item.id,
      username: item.username,
      displayName: item.displayName,
      personId: item.personId,
      role: "player",
      passwordHash: hashPassword(item.password),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    }))];
    writeLocalUsers(users);
  }

  if (created.length && remote) {
    const statements = created.map((item) => `INSERT INTO app_users (id, username, display_name, person_id, role, password_hash, created_at, updated_at, last_login_at) VALUES (`
      + [sqlValue(item.id), sqlValue(item.username), sqlValue(item.displayName), sqlValue(item.personId), sqlValue("player"), sqlValue(hashPassword(item.password)), sqlValue(now), sqlValue(now), "NULL"].join(", ")
      + ");").join("\n");
    const temporary = path.join(dataDirectory, ".seed-app-users.sql");
    fs.writeFileSync(temporary, `${statements}\n`);
    try {
      execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", `--file=${temporary}`],
        { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  console.log(`\n新建账号 ${created.length} 个${remote ? "（本地 + 云端）" : "（仅本地）"}${skipped.length ? `，已存在跳过 ${skipped.join("、")}` : ""}\n`);
  if (created.length) {
    console.log("账号\t人物\t\t密码");
    for (const item of created) console.log(`${item.username}\t${item.displayName}\t${item.password}`);
    console.log("\n以上密码只显示这一次，请尽快转交给本人。");
  }
}

main();
