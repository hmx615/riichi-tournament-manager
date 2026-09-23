import "server-only";

import { redirect } from "next/navigation";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";

/** 牌谱录入是独立权限：管理员和选手账号均可录入，访客不可。 */
export async function canEnterCompetitionMatches(_competitionId: string) {
  if (await isAdmin()) return true;
  return Boolean(await currentPlayer());
}

export async function requireCompetitionMatchEntryPage(competitionId: string, returnPath: string) {
  if (await canEnterCompetitionMatches(competitionId)) return;
  const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
  redirect(`/login?next=${encodeURIComponent(safePath)}`);
}
