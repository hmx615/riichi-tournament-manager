"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authenticateTutorialReviewer,
  clearTutorialSession,
  createTutorialSession,
  tutorialAuthConfigured,
} from "@/server/tutorial-auth";
import { clearLoginFailures, loginIsBlocked, recordLoginFailure } from "@/server/login-rate-limit";

export type TutorialLoginState = { status: "idle" | "error"; message: string };

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(300),
  next: z.string().optional(),
});

function safeDestination(value?: string) {
  return value?.startsWith("/tutorials/") && !value.startsWith("//")
    ? value
    : "/tutorials/one-shanten/initial";
}

async function requestAddress() {
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")
    || "local";
  return `tutorial:${address}`;
}

export async function tutorialLoginAction(
  _state: TutorialLoginState,
  formData: FormData,
): Promise<TutorialLoginState> {
  if (!tutorialAuthConfigured()) return { status: "error", message: "服务器尚未配置牌例筛选账号" };
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { status: "error", message: "请输入账号和密码" };
  const address = await requestAddress();
  if (await loginIsBlocked(address)) return { status: "error", message: "登录尝试过多，请稍后再试" };
  const reviewer = await authenticateTutorialReviewer(parsed.data.username, parsed.data.password);
  if (!reviewer) {
    await recordLoginFailure(address);
    return { status: "error", message: "账号或密码错误" };
  }
  await clearLoginFailures(address);
  await createTutorialSession(reviewer.id);
  redirect(safeDestination(parsed.data.next));
}

export async function tutorialLogoutAction() {
  await clearTutorialSession();
  redirect("/tutorials/login");
}
