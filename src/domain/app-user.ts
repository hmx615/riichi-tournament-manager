import { z } from "zod";

export const appUserRoles = ["player", "admin"] as const;
export type AppUserRole = (typeof appUserRoles)[number];

export type AppUser = {
  id: string;
  username: string;
  displayName: string;
  /** 绑定的人物 ID；散排录入的本人校验以此为准。 */
  personId: string | null;
  role: AppUserRole;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export const createAppUserSchema = z.object({
  // 账号直接用排行榜上的人物名，中文/日文名也是合法账号；
  // 禁止的是空白、控制字符和容易混淆的分隔符，登录时不区分大小写。
  username: z.string().trim().min(2, "账号至少 2 个字符").max(32, "账号最多 32 个字符")
    .regex(/^[^\s\u0000-\u001f\/\\:@?#]+$/u, "账号不能包含空格、斜杠或冒号等分隔符"),
  displayName: z.string().trim().max(40, "备注最多 40 个字符").optional(),
  personId: z.string().trim().min(1, "请选择绑定人物"),
  password: z.string().min(8, "密码至少 8 位").max(72, "密码最多 72 位"),
});

export type CreateAppUserInput = z.infer<typeof createAppUserSchema>;

export function normalizeUsername(value: string) {
  // NFC 归一化：避免「が」这类字符因为组合形式不同被当成两个账号。
  return value.trim().normalize("NFC").toLowerCase();
}

const passwordAlphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 生成随机初始密码，剔除容易看错的 0/O/1/l/I。 */
export function generateAppUserPassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => passwordAlphabet[byte % passwordAlphabet.length]).join("");
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

/**
 * 选手账号用 PBKDF2 加盐哈希：不依赖部署时的密钥，方便批量初始化与后台重置密码。
 * 迭代次数写进哈希串，以后调高不会让旧密码失效。
 */
export const appUserPasswordIterations = 60000;

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashAppUserPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const digest = await derivePassword(password, salt, appUserPasswordIterations);
  return `pbkdf2-sha256$${appUserPasswordIterations}$${encodeBase64Url(salt)}$${encodeBase64Url(digest)}`;
}

export async function verifyAppUserPassword(password: string, encoded: string) {
  const [algorithm, iterationText, saltText, digestText, extra] = encoded.split("$");
  if (algorithm !== "pbkdf2-sha256" || !saltText || !digestText || extra) return false;
  const iterations = Number(iterationText);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1000000) return false;
  try {
    const actual = await derivePassword(password, decodeBase64Url(saltText), iterations);
    return safeEqual(actual, decodeBase64Url(digestText));
  } catch {
    return false;
  }
}

export function describeAppUser(user: Pick<AppUser, "username" | "displayName" | "role">) {
  const role = user.role === "admin" ? "管理员" : "选手";
  return user.displayName ? `${user.displayName}（${user.username}·${role}）` : `${user.username}（${role}）`;
}
