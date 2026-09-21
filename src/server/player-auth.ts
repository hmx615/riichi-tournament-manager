import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createPlayerSessionToken, verifyPlayerSessionToken } from "@/domain/admin-auth";
import { getAppUser, recordAppUserLogin } from "@/server/user-repository";
import type { AppUser } from "@/domain/app-user";

const sessionCookieName = "xrc_player_session";
// 选手多为手机端访问，登录一次保留两周。
const sessionLifetimeSeconds = 14 * 24 * 60 * 60;

function sessionSecret() {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function playerAuthConfigured() {
  return sessionSecret() !== null;
}

export async function createPlayerSession(user: AppUser) {
  const secret = sessionSecret();
  if (!secret) throw new Error("选手登录尚未配置");
  const expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
  const token = await createPlayerSessionToken(secret, {
    userId: user.id,
    username: user.username,
    personId: user.personId,
  }, expiresAt);
  (await cookies()).set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false"),
    path: "/",
    maxAge: sessionLifetimeSeconds,
    priority: "high",
  });
  await recordAppUserLogin(user.id);
}

export async function clearPlayerSession() {
  (await cookies()).delete(sessionCookieName);
}

/** 每次请求都回表校验：账号被管理员删除后，旧 Cookie 立即失效。 */
export async function currentPlayer(): Promise<AppUser | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;
  const payload = await verifyPlayerSessionToken(token, secret);
  if (!payload) return null;
  return await getAppUser(payload.userId);
}

export async function requirePlayerPage(returnPath: string) {
  const player = await currentPlayer();
  if (player) return player;
  const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/casual";
  redirect(`/login?next=${encodeURIComponent(safePath)}`);
}
