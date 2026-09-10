import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { hashAdminPassword } from "../src/domain/admin-auth";

const root = process.cwd();
const envFile = path.join(root, ".env.local");
const credentials = [
  ["HMX", process.env.TUTORIAL_HMX_PASSWORD],
  ["PHQ", process.env.TUTORIAL_PHQ_PASSWORD],
  ["EZY", process.env.TUTORIAL_EZY_PASSWORD],
  ["WDJ", process.env.TUTORIAL_WDJ_PASSWORD],
] as const;
if (credentials.some(([, password]) => !password)) throw new Error("请通过环境变量提供四个筛选账号的密码");

const source = await fs.readFile(envFile, "utf8");
const secret = source.match(/^AUTH_SECRET=(.+)$/m)?.[1]?.trim();
if (!secret || secret.length < 32) throw new Error(".env.local 中缺少有效的 AUTH_SECRET");
const hashKeys = credentials.map(([id]) => `TUTORIAL_${id}_PASSWORD_HASH=`);
const filtered = source.split(/\r?\n/).filter((line) => !hashKeys.some((key) => line.startsWith(key)));
const hashes = await Promise.all(credentials.map(async ([id, password]) => (
  `TUTORIAL_${id}_PASSWORD_HASH=${(await hashAdminPassword(password!, secret)).replaceAll("$", "\\$")}`
)));
const document = [
  ...filtered.filter((line, index, values) => line || index < values.length - 1),
  ...hashes,
  "",
].join("\n");
await fs.writeFile(envFile, document, { mode: 0o600 });
console.log("牌例筛选账号哈希已写入 .env.local");
