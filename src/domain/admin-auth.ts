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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

export async function hashAdminPassword(password: string, pepper: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const encodedSalt = encodeBase64Url(salt);
  const digest = await hmac(pepper, `${encodedSalt}\u0000${password}`);
  return `hmac-sha256$${encodedSalt}$${encodeBase64Url(digest)}`;
}

export async function verifyAdminPassword(password: string, encoded: string, pepper: string) {
  const [algorithm, saltText, expectedText, extra] = encoded.split("$");
  if (algorithm !== "hmac-sha256" || !saltText || !expectedText || extra) return false;
  try {
    const expected = decodeBase64Url(expectedText);
    const actual = await hmac(pepper, `${saltText}\u0000${password}`);
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createAdminSessionToken(secret: string, expiresAt: number) {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ version: 1, role: "admin", expiresAt })));
  const signature = encodeBase64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifyAdminSessionToken(token: string, secret: string, now = Date.now()) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    if (!safeEqual(decodeBase64Url(signature), await hmac(secret, payload))) return false;
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as Record<string, unknown>;
    return data.version === 1 && data.role === "admin" && typeof data.expiresAt === "number" && data.expiresAt > now;
  } catch {
    return false;
  }
}
