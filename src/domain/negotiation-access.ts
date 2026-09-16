import type { NegotiationAccessGuard } from "./types";

export const maxAccessCodeAttempts = 5;
export const accessCodeLockMinutes = 10;
/** 整届口令的闸门：连续输错 10 次才短暂锁定 1 分钟（8 位口令很难被爆破，不要因为个人手滑锁住全届）。 */
export const guardMaxAttempts = 10;
export const guardLockMinutes = 1;

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

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** 生成 8 位数字口令，允许前导零；本届比赛每人一条，避免碰撞。 */
export function generateAccessCode(randomValues = crypto.getRandomValues(new Uint32Array(1))) {
  return String(randomValues[0] % 100_000_000).padStart(8, "0");
}

export function normalizeAccessCode(value: string) {
  return value.replace(/\s/g, "");
}

export function isValidAccessCodeFormat(value: string) {
  return /^\d{8}$/.test(normalizeAccessCode(value));
}

/** 口令只存 HMAC 哈希，和人物密码同一套做法。 */
export async function hashAccessCode(secret: string, code: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const encodedSalt = encodeBase64Url(salt);
  const digest = await hmac(secret, `${encodedSalt}\u0000${normalizeAccessCode(code)}`);
  return `hmac-sha256$${encodedSalt}$${encodeBase64Url(digest)}`;
}

export async function verifyAccessCode(secret: string, code: string, encoded: string) {
  const [algorithm, saltText, expectedText, extra] = encoded.split("$");
  if (algorithm !== "hmac-sha256" || !saltText || !expectedText || extra) return false;
  if (!isValidAccessCodeFormat(code)) return false;
  try {
    const expected = decodeBase64Url(expectedText);
    const actual = await hmac(secret, `${saltText}\u0000${normalizeAccessCode(code)}`);
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function accessCodeLockedUntil(entry: { lockedUntil?: string }, now = Date.now()) {
  if (!entry.lockedUntil) return 0;
  const until = Date.parse(entry.lockedUntil);
  return Number.isFinite(until) && until > now ? until : 0;
}

/** 连续输错达到上限就锁定一段时间，避免口令被暴力破解。 */
export function registerFailedAttempt(
  entry: NegotiationAccessGuard,
  at = new Date(),
  options: { maxAttempts: number; lockMinutes: number } = { maxAttempts: maxAccessCodeAttempts, lockMinutes: accessCodeLockMinutes },
): NegotiationAccessGuard {
  const failedAttempts = entry.failedAttempts + 1;
  if (failedAttempts < options.maxAttempts) return { ...entry, failedAttempts, lockedUntil: undefined };
  return {
    ...entry,
    failedAttempts: 0,
    lockedUntil: new Date(at.getTime() + options.lockMinutes * 60 * 1000).toISOString(),
  };
}

export function remainingAttempts(entry: Pick<NegotiationAccessGuard, "failedAttempts">, maxAttempts = maxAccessCodeAttempts) {
  return Math.max(0, maxAttempts - entry.failedAttempts);
}
