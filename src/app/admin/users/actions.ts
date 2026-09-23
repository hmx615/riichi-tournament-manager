"use server";

import { revalidatePath } from "next/cache";
import { createAppUserSchema, generateAppUserPassword, normalizeUsername } from "@/domain/app-user";
import { isAdmin } from "@/server/auth";
import { getPerson } from "@/server/person-repository";
import { createAppUser, deleteAppUser, getAppUser, updateAppUser } from "@/server/user-repository";

export type AppUserActionState = {
  status: "idle" | "error" | "success";
  message: string;
  credentials?: { username: string; password: string } | null;
  values?: Record<string, string>;
};

function formValues(formData: FormData) {
  return {
    username: String(formData.get("username") || ""),
    displayName: String(formData.get("displayName") || ""),
    personId: String(formData.get("personId") || ""),
  };
}

export async function createAppUserAction(_state: AppUserActionState, formData: FormData): Promise<AppUserActionState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  const values = formValues(formData);
  const password = String(formData.get("password") || "").trim() || generateAppUserPassword();
  const parsed = createAppUserSchema.safeParse({ ...values, password });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message || "账号信息无效", values };
  const person = await getPerson(parsed.data.personId);
  if (!person) return { status: "error", message: "绑定的人物不存在", values };
  try {
    await createAppUser({
      username: parsed.data.username,
      // 备注留空时直接用人物当前名字，避免出现真名。
      displayName: parsed.data.displayName?.trim() || person.displayName,
      personId: parsed.data.personId,
      role: "player",
      password,
    });
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "账号创建失败", values };
  }
  revalidatePath("/admin/users");
  return {
    status: "success",
    message: "账号已创建，请把下面这组账号密码发给本人（密码只显示这一次）。",
    credentials: { username: normalizeUsername(parsed.data.username), password },
    values: {},
  };
}

export async function resetAppUserPasswordAction(_state: AppUserActionState, formData: FormData): Promise<AppUserActionState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  const id = String(formData.get("userId") || "");
  const user = id ? await getAppUser(id) : null;
  if (!user) return { status: "error", message: "账号不存在" };
  const password = generateAppUserPassword();
  try {
    await updateAppUser(user.id, { password });
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "重置密码失败" };
  }
  revalidatePath("/admin/users");
  return { status: "success", message: `已重置 ${user.username} 的密码`, credentials: { username: user.username, password } };
}

export async function deleteAppUserAction(formData: FormData) {
  if (!await isAdmin()) return;
  const id = String(formData.get("userId") || "");
  if (!id) return;
  await deleteAppUser(id);
  revalidatePath("/admin/users");
}
