/**
 * 选手协商会话：口令验证通过后签发一个签名 Cookie，
 * 之后在本届比赛内无需再次输入口令（Cookie 由服务端保存在浏览器里）。
 */

export type NegotiationSessionPayload = {
  competitionId: string;
  participantId: string;
  expiresAt: number;
};

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

export async function createNegotiationSession(secret: string, payload: NegotiationSessionPayload) {
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ version: 1, ...payload })));
  return `${encoded}.${encodeBase64Url(await hmac(secret, encoded))}`;
}

export async function verifyNegotiationSession(secret: string, token: string, now = Date.now()): Promise<NegotiationSessionPayload | null> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    if (!safeEqual(decodeBase64Url(signature), await hmac(secret, payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as Record<string, unknown>;
    if (data.version !== 1 || typeof data.competitionId !== "string" || typeof data.participantId !== "string") return null;
    const expiresAt = Number(data.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt < now) return null;
    return { competitionId: data.competitionId, participantId: data.participantId, expiresAt };
  } catch {
    return null;
  }
}
