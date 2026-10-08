#!/usr/bin/env node
// 校验 secrets 交付文件里的账号密码与线上 D1 是否一致（用应用自己的校验函数）。
// 用法：npx vite-node scripts/verify-delivered-credentials.ts <交付文件>

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { verifyAppUserPassword, normalizeUsername } from "../src/domain/app-user";

const projectRoot = path.resolve(import.meta.dirname, "..");
const database = "riichi-tournament-manager";
const deliveryFile = process.argv[2];
if (!deliveryFile) throw new Error("用法：npx vite-node scripts/verify-delivered-credentials.ts <交付文件>");

const output = execFileSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", "SELECT username, password_hash FROM app_users"], {
  cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
});
type AppUserRow = { username: string; password_hash: string };
const result = JSON.parse(output.slice(output.indexOf("["))) as Array<{ results?: AppUserRow[] }>;
const hashes = new Map<string, string>(result
  .flatMap((entry) => entry.results ?? [])
  .map((row) => [normalizeUsername(row.username), row.password_hash] as const));

let ok = 0;
const failures: string[] = [];
for (const line of fs.readFileSync(deliveryFile, "utf8").split("\n")) {
  if (!line.includes("\t")) continue;
  const [username, password] = line.split("\t") as [string, string];
  const hash = hashes.get(normalizeUsername(username));
  if (!hash) { failures.push(`${username}：D1 里没有这个账号`); continue; }
  if (await verifyAppUserPassword(password, hash)) ok += 1;
  else failures.push(`${username}：密码与 D1 不一致`);
}

for (const failure of failures) console.log("✗", failure);
console.log(`交付文件校验：${ok} 条通过，${failures.length} 条失败`);
if (failures.length) process.exit(1);
