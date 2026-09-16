"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteMatch, getCompetition, updateCompetition } from "@/server/competition-repository";
import { requireAdmin } from "@/server/auth";
import { correctMatchSeats } from "@/domain/match-correction";
import type { MatchRecord } from "@/domain/types";

function matchPath(competitionId: string, matchNumber: number) {
  return `/competitions/${competitionId}/matches/${matchNumber}`;
}

export async function updateMatchSeatsAction(formData: FormData) {
  await requireAdmin();
  const competitionId = String(formData.get("competitionId") || "");
  const matchNumber = Number(formData.get("matchNumber"));
  const reason = String(formData.get("reason") || "");
  const participantIds = [0, 1, 2, 3].map((seat) => String(formData.get(`participant${seat}`) || ""));
  if (!/^[a-z0-9-]+$/.test(competitionId)) throw new Error("比赛 ID 格式无效");
  if (!Number.isInteger(matchNumber) || matchNumber < 1) throw new Error("场次编号无效");
  const competition = await getCompetition(competitionId);
  if (!competition) throw new Error("比赛不存在");
  const match = competition.matches.find((item) => item.matchNumber === matchNumber);
  if (!match) throw new Error("对局不存在或已经删除");
  let corrected: MatchRecord;
  try {
    corrected = correctMatchSeats(competition, match, { participantIds, reason });
  } catch (error) {
    const message = error instanceof Error ? error.message : "身份修正失败";
    redirect(`${matchPath(competitionId, matchNumber)}?error=${encodeURIComponent(message)}`);
  }
  competition.matches = competition.matches.map((item) => item.matchNumber === matchNumber ? corrected : item);
  await updateCompetition(competition);
  revalidatePath("/");
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/data`);
  revalidatePath(`/competitions/${competition.id}/schedule`);
  revalidatePath(`/competitions/${competition.id}/matches`);
  revalidatePath(matchPath(competitionId, matchNumber));
  redirect(`${matchPath(competitionId, matchNumber)}?saved=1`);
}

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
