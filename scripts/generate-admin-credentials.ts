import fs from "node:fs/promises";
import path from "node:path";
import { hashAdminPassword } from "../src/domain/admin-auth";

const root = process.cwd();
const username = String(process.argv[2] || "admin").trim();
if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) throw new Error("管理员账号仅允许 3-40 位英文、数字、点、下划线或连字符");

function randomBase64Url(length: number) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(length))).toString("base64url");
}

const password = randomBase64Url(18);
const authSecret = randomBase64Url(48);
const passwordHash = await hashAdminPassword(password, authSecret);
const envFile = path.join(root, ".env.local");
const secretDirectory = path.join(root, ".secrets");
const loginFile = path.join(secretDirectory, "admin-login.txt");

await fs.mkdir(secretDirectory, { recursive: true });
await fs.writeFile(envFile, [
  `ADMIN_USERNAME=${username}`,
  `ADMIN_PASSWORD_HASH=${passwordHash.replaceAll("$", "\\$")}`,
  `AUTH_SECRET=${authSecret}`,
  "AUTH_COOKIE_SECURE=false",
  "",
].join("\n"), { flag: "wx", mode: 0o600 });
await fs.writeFile(loginFile, `管理员账号：${username}\n管理员初始密码：${password}\n`, { flag: "wx", mode: 0o600 });
console.log(`管理员配置已写入 ${envFile}`);
console.log(`初始登录信息已写入 ${loginFile}`);
