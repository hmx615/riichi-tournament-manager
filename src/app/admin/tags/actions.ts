"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/server/auth";
import { createPersonTag, deletePersonTag, setPersonTagMembers } from "@/server/person-tag-repository";

export type PersonTagActionState = { status: "idle" | "error" | "success"; message: string };

function revalidateTagPages() {
  revalidatePath("/admin/tags");
  revalidatePath("/players");
  revalidatePath("/players/new");
  revalidatePath("/competitions/match-pool");
  revalidatePath("/competitions/match-pool/settings");
}

export async function createPersonTagAction(
  _state: PersonTagActionState,
  formData: FormData,
): Promise<PersonTagActionState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  try {
    const tag = await createPersonTag(String(formData.get("name") || ""));
    revalidateTagPages();
    return { status: "success", message: `标签“${tag}”已创建` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "标签创建失败" };
  }
}

export async function deletePersonTagAction(formData: FormData) {
  if (!await isAdmin()) return;
  const tag = String(formData.get("name") || "");
  if (!tag) return;
  await deletePersonTag(tag);
  revalidateTagPages();
}

export async function savePersonTagMembersAction(
  _state: PersonTagActionState,
  formData: FormData,
): Promise<PersonTagActionState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  const tag = String(formData.get("tag") || "");
  const personIds = formData.getAll("personIds").filter((value): value is string => typeof value === "string");
  try {
    const result = await setPersonTagMembers(tag, personIds);
    revalidateTagPages();
    return { status: "success", message: `已保存：“${tag}”现在有 ${result.selected} 人${"changed" in result ? `（本次改动 ${result.changed} 人）` : ""}` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "标签成员保存失败" };
  }
}
