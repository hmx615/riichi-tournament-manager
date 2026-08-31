import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const passwordKeyLength = 32;
const passwordParameters = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashAdminPassword(password: string, salt = randomBytes(16)) {
  const key = await deriveKey(password, salt, passwordKeyLength, passwordParameters);
  return `scrypt$${passwordParameters.N}$${passwordParameters.r}$${passwordParameters.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, saltText, expectedText] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !expectedText) return false;
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 };
  if (!Number.isInteger(options.N) || !Number.isInteger(options.r) || !Number.isInteger(options.p)) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(expectedText, "base64url");
    const actual = await deriveKey(password, salt, expected.length, options);
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createAdminSessionToken(secret: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ version: 1, role: "admin", expiresAt }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(token: string, secret: string, now = Date.now()) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
  if (!safeEqual(actual, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return data.version === 1 && data.role === "admin" && typeof data.expiresAt === "number" && data.expiresAt > now;
  } catch {
    return false;
  }
}
