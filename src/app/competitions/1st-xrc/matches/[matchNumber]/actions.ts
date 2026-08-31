"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteMatch } from "@/server/competition-repository";
import { requireAdmin } from "@/server/auth";

export async function deleteMatchAction(matchNumber: number) {
  if (!Number.isInteger(matchNumber) || matchNumber < 1) throw new Error("场次编号无效");
  await requireAdmin();
  await deleteMatch("1st-xrc", matchNumber);
  revalidatePath("/");
  revalidatePath("/competitions/1st-xrc");
  revalidatePath("/competitions/1st-xrc/data");
  redirect("/competitions/1st-xrc");
}
