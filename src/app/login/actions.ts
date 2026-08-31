"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminAuthConfigured, authenticateAdmin, clearAdminSession, createAdminSession } from "@/server/auth";

export type LoginState = { status: "idle" | "error"; message: string };

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(300),
  next: z.string().optional(),
});

const attempts = new Map<string, { failures: number; blockedUntil: number }>();

function safeDestination(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function requestAddress() {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local";
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  if (!adminAuthConfigured()) return { status: "error", message: "服务器尚未配置管理员账号" };
  const parsed = loginSchema.safeParse({ username: formData.get("username"), password: formData.get("password"), next: formData.get("next") });
  if (!parsed.success) return { status: "error", message: "请输入管理员账号和密码" };
  const address = await requestAddress();
  const current = attempts.get(address);
  if (current && current.blockedUntil > Date.now()) return { status: "error", message: "登录尝试过多，请稍后再试" };

  if (!await authenticateAdmin(parsed.data.username, parsed.data.password)) {
    const failures = (current?.failures || 0) + 1;
    attempts.set(address, { failures, blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
    return { status: "error", message: "管理员账号或密码错误" };
  }

  attempts.delete(address);
  await createAdminSession();
  redirect(safeDestination(parsed.data.next));
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/");
}
