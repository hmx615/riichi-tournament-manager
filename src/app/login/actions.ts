"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminAuthConfigured, authenticateAdmin, clearAdminSession, createAdminSession } from "@/server/auth";
import { clearLoginFailures, loginIsBlocked, recordLoginFailure } from "@/server/login-rate-limit";
import { clearPlayerSession, createPlayerSession, playerAuthConfigured } from "@/server/player-auth";
import { verifyAppUserCredentials } from "@/server/user-repository";

export type LoginState = { status: "idle" | "error"; message: string };

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(300),
  next: z.string().optional(),
});

function safeDestination(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function requestAddress() {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local";
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  if (!adminAuthConfigured() && !playerAuthConfigured()) return { status: "error", message: "服务器尚未配置登录账号" };
  const parsed = loginSchema.safeParse({ username: formData.get("username"), password: formData.get("password"), next: formData.get("next") });
  if (!parsed.success) return { status: "error", message: "请输入账号和密码" };
  const address = await requestAddress();
  if (await loginIsBlocked(address)) return { status: "error", message: "登录尝试过多，请稍后再试" };

  if (adminAuthConfigured() && await authenticateAdmin(parsed.data.username, parsed.data.password)) {
    await clearPlayerSession();
    await clearLoginFailures(address);
    await createAdminSession();
    redirect(safeDestination(parsed.data.next));
  }

  const player = playerAuthConfigured() ? await verifyAppUserCredentials(parsed.data.username, parsed.data.password) : null;
  if (!player) {
    await recordLoginFailure(address);
    return { status: "error", message: "账号或密码错误" };
  }

  await clearLoginFailures(address);
  await clearAdminSession();
  await createPlayerSession(player);
  redirect(safeDestination(parsed.data.next));
}

/** 登出后回到退出前所在的那个页面，而不是一律回首页。 */
export async function logoutAction(formData?: FormData) {
  await clearAdminSession();
  await clearPlayerSession();
  const next = formData ? String(formData.get("next") ?? "") : "";
  redirect(safeDestination(next));
}
