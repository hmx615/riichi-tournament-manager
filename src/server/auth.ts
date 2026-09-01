import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSessionToken, verifyAdminPassword, verifyAdminSessionToken } from "@/domain/admin-auth";

const sessionCookieName = "xrc_admin_session";
const sessionLifetimeSeconds = 12 * 60 * 60;

function configuration() {
  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.AUTH_SECRET;
  if (!username || !passwordHash || !secret || secret.length < 32) return null;
  return { username, passwordHash, secret };
}

export function adminAuthConfigured() {
  return configuration() !== null;
}

export async function authenticateAdmin(username: string, password: string) {
  const config = configuration();
  if (!config || username !== config.username) return false;
  return verifyAdminPassword(password, config.passwordHash, config.secret);
}

export async function createAdminSession() {
  const config = configuration();
  if (!config) throw new Error("管理员认证尚未配置");
  const expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, await createAdminSessionToken(config.secret, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false"),
    path: "/",
    maxAge: sessionLifetimeSeconds,
    priority: "high",
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function isAdmin() {
  const config = configuration();
  if (!config) return false;
  const token = (await cookies()).get(sessionCookieName)?.value;
  return Boolean(token && await verifyAdminSessionToken(token, config.secret));
}

export async function requireAdmin() {
  if (!await isAdmin()) throw new Error("需要管理员登录");
}

export async function requireAdminPage(returnPath: string) {
  if (await isAdmin()) return;
  const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
  redirect(`/login?next=${encodeURIComponent(safePath)}`);
}
