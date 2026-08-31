"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteMatch } from "@/server/competition-repository";
import { requireAdmin } from "@/server/auth";

export async function deleteCompetitionMatchAction(competitionId: string, matchNumber: number) {
  if (!/^[a-z0-9-]+$/.test(competitionId)) throw new Error("比赛 ID 格式无效");
  if (!Number.isInteger(matchNumber) || matchNumber < 1) throw new Error("场次编号无效");
  await requireAdmin();
  await deleteMatch(competitionId, matchNumber);
  revalidatePath("/");
  revalidatePath(`/competitions/${competitionId}`);
  revalidatePath(`/competitions/${competitionId}/data`);
  redirect(`/competitions/${competitionId}`);
}
