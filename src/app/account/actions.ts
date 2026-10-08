"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAppUserSchema } from "@/domain/app-user";
import { detectAvatarContentType, maxAvatarBytes } from "@/domain/avatar";
import { currentPlayer } from "@/server/player-auth";
import { getPerson, updatePerson } from "@/server/person-repository";
import { updateAppUser } from "@/server/user-repository";
import { deleteAvatar, newAvatarKey, putAvatar } from "@/server/avatar-storage";
import type { Person } from "@/domain/types";

export type AccountState = {
  status: "idle" | "error" | "success";
  message: string;
  values?: Record<string, string>;
};

const accountSchema = createAppUserSchema.pick({ username: true }).extend({
  displayName: z.string().trim().max(40, "昵称最多 40 个字符"),
  personDisplayName: z.string().trim().min(1, "人物名不能为空").max(40, "人物名最多 40 个字符"),
});

function uploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.text === "function");
}

/**
 * 选手改自己的资料：账号、昵称、人物显示名、头像。
 * 刻意不提供删除账号——删号要找管理员，避免误操作把人从赛程里摘掉。
 */
export async function updateOwnAccountAction(_state: AccountState, formData: FormData): Promise<AccountState> {
  const player = await currentPlayer();
  if (!player) return { status: "error", message: "请先用选手账号登录" };

  const values = {
    username: String(formData.get("username") || "").trim(),
    displayName: String(formData.get("displayName") || "").trim(),
    personDisplayName: String(formData.get("personDisplayName") || "").trim(),
  };
  const parsed = accountSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message || "资料不合法", values };

  const avatarFile = formData.get("avatar");
  const removeAvatar = formData.get("removeAvatar") === "on";
  if (removeAvatar && uploadedFile(avatarFile) && avatarFile.size > 0) return { status: "error", message: "上传新头像和删除头像不能同时选择", values };
  let avatarBytes: Uint8Array | null = null;
  let avatarContentType: Person["avatarContentType"];
  if (uploadedFile(avatarFile) && avatarFile.size > 0) {
    if (avatarFile.size > maxAvatarBytes) return { status: "error", message: "头像不能超过 2 MB", values };
    avatarBytes = new Uint8Array(await avatarFile.arrayBuffer());
    avatarContentType = detectAvatarContentType(avatarBytes) || undefined;
    if (!avatarContentType) return { status: "error", message: "头像仅支持 JPG、PNG 或 WebP", values };
  }

  try {
    await updateAppUser(player.id, {
      username: parsed.data.username,
      displayName: parsed.data.displayName || parsed.data.personDisplayName,
    });
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "账号信息保存失败", values };
  }

  // 人物显示名和头像挂在人物档案上，只改自己绑定的那一个。
  if (player.personId) {
    const person = await getPerson(player.personId);
    if (person && (person.displayName !== parsed.data.personDisplayName || avatarBytes || removeAvatar)) {
      const previousAvatarKey = person.avatarKey;
      const next: Person = {
        ...person,
        displayName: parsed.data.personDisplayName,
        aliases: [...new Set([parsed.data.personDisplayName, ...person.aliases.filter((alias) => alias !== person.displayName)])],
      };
      if (removeAvatar) {
        delete next.avatarKey;
        delete next.avatarVersion;
        delete next.avatarContentType;
      }
      if (avatarBytes && avatarContentType) {
        const key = newAvatarKey(person.id);
        await putAvatar(key, avatarBytes, avatarContentType);
        next.avatarKey = key;
        next.avatarVersion = Date.now();
        next.avatarContentType = avatarContentType;
      }
      await updatePerson(next);
      if (removeAvatar && previousAvatarKey) await deleteAvatar(previousAvatarKey);
    }
  }

  revalidatePath("/account");
  revalidatePath("/players", "layout");
  revalidatePath("/");
  redirect(`/account?saved=1`);
}
