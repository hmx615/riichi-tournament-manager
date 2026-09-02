"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Person, PersonAccount } from "@/domain/types";
import { isAdmin } from "@/server/auth";
import { createPerson, updatePerson } from "@/server/person-repository";

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
  const person: Person = {
    id: parsed.data.id,
    displayName: parsed.data.displayName,
    kind: parsed.data.kind,
    color: parsed.data.color.toLowerCase(),
    aliases: [...new Set([parsed.data.displayName, ...values(parsed.data.aliases)])],
    accounts: accounts(parsed.data),
  };
  try {
    if (parsed.data.mode === "edit") await updatePerson(person);
    else await createPerson(person);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "人物保存失败" };
  }
  revalidatePath("/players");
  revalidatePath(`/players/${person.id}`);
  redirect(`/players/${person.id}`);
}
