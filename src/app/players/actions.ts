"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { detectAvatarContentType, maxAvatarBytes } from "@/domain/avatar";
import type { Person, PersonAccount } from "@/domain/types";
import { isAdmin } from "@/server/auth";
import { deleteAvatar, newAvatarKey, putAvatar } from "@/server/avatar-storage";
import { createPerson, getPerson, updatePerson } from "@/server/person-repository";

export type PersonFormState = { status: "idle" | "error"; message: string };

const schema = z.object({
  mode: z.enum(["create", "edit"]),
  originalId: z.string().optional(),
  id: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, "人物 ID 仅允许小写英文、数字和连字符"),
  displayName: z.string().trim().min(1).max(40),
  kind: z.enum(["human", "ai"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  aliases: z.string(),
  tenhouAccounts: z.string(),
  majsoulAccounts: z.string(),
  otherAccounts: z.string(),
});

function values(value: string) {
  return [...new Set(value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function accounts(parsed: z.infer<typeof schema>): PersonAccount[] {
  return [
    ...values(parsed.tenhouAccounts).map((username) => ({ platform: "tenhou" as const, username })),
    ...values(parsed.majsoulAccounts).map((username) => ({ platform: "majsoul" as const, username })),
    ...values(parsed.otherAccounts).map((username) => ({ platform: "other" as const, username })),
  ];
}

function uploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value !== "string" && typeof value.arrayBuffer === "function");
}

export async function savePersonAction(_state: PersonFormState, formData: FormData): Promise<PersonFormState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  const parsed = schema.safeParse({
    mode: formData.get("mode"),
    originalId: formData.get("originalId") || undefined,
    id: formData.get("id"),
    displayName: formData.get("displayName"),
    kind: formData.get("kind"),
    color: formData.get("color"),
    aliases: formData.get("aliases"),
    tenhouAccounts: formData.get("tenhouAccounts"),
    majsoulAccounts: formData.get("majsoulAccounts"),
    otherAccounts: formData.get("otherAccounts"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message || "人物数据格式无效" };
  if (parsed.data.mode === "edit" && parsed.data.originalId !== parsed.data.id) return { status: "error", message: "人物 ID 不允许修改" };
  const current = parsed.data.mode === "edit" ? await getPerson(parsed.data.id) : null;
  if (parsed.data.mode === "edit" && !current) return { status: "error", message: "人物不存在" };
  const avatarFile = formData.get("avatar");
  const removeAvatar = formData.get("removeAvatar") === "on";
  if (removeAvatar && uploadedFile(avatarFile) && avatarFile.size > 0) return { status: "error", message: "上传新头像和删除头像不能同时选择" };
  let avatarBytes: Uint8Array | null = null;
  let avatarContentType: Person["avatarContentType"];
  if (uploadedFile(avatarFile) && avatarFile.size > 0) {
    if (avatarFile.size > maxAvatarBytes) return { status: "error", message: "人物头像不能超过 2 MB" };
    avatarBytes = new Uint8Array(await avatarFile.arrayBuffer());
    avatarContentType = detectAvatarContentType(avatarBytes) || undefined;
    if (!avatarContentType) return { status: "error", message: "人物头像仅支持 JPG、PNG 或 WebP" };
  }
  const person: Person = {
    id: parsed.data.id,
    displayName: parsed.data.displayName,
    kind: parsed.data.kind,
    color: parsed.data.color.toLowerCase(),
    aliases: [...new Set([parsed.data.displayName, ...values(parsed.data.aliases)])],
    accounts: accounts(parsed.data),
    ...(!removeAvatar && current?.avatarKey && current.avatarContentType ? {
      avatarKey: current.avatarKey,
      avatarVersion: current.avatarVersion,
      avatarContentType: current.avatarContentType,
    } : {}),
  };
  const previousAvatarKey = current?.avatarKey;
  let uploadedAvatarKey: string | null = null;
  try {
    if (avatarBytes && avatarContentType) {
      uploadedAvatarKey = newAvatarKey(person.id);
      await putAvatar(uploadedAvatarKey, avatarBytes, avatarContentType);
      person.avatarKey = uploadedAvatarKey;
      person.avatarVersion = Date.now();
      person.avatarContentType = avatarContentType;
    }
    if (parsed.data.mode === "edit") await updatePerson(person);
    else await createPerson(person);
  } catch (error) {
    if (uploadedAvatarKey) await deleteAvatar(uploadedAvatarKey).catch(() => {});
    return { status: "error", message: error instanceof Error ? error.message : "人物保存失败" };
  }
  if (previousAvatarKey && previousAvatarKey !== person.avatarKey) await deleteAvatar(previousAvatarKey).catch(() => {});
  revalidatePath("/players");
  revalidatePath(`/players/${person.id}`);
  revalidatePath(`/api/avatars/${person.id}`);
  redirect(`/players/${person.id}`);
}
