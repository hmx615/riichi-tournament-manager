"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { deleteClubRegistration } from "@/server/club-registration-repository";

const registrationIdSchema = z.string().uuid();

export async function deleteRegistrationAction(formData: FormData) {
  await requireAdmin();
  const parsed = registrationIdSchema.safeParse(formData.get("registrationId"));
  if (!parsed.success) throw new Error("登记记录 ID 无效");
  if (!await deleteClubRegistration(parsed.data)) throw new Error("登记记录不存在或已经删除");
  revalidatePath("/join/responses");
}
