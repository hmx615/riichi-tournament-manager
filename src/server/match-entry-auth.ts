import "server-only";

import { redirect } from "next/navigation";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";
import { getCompetition } from "@/server/competition-repository";
import { tableHasParticipant } from "@/domain/scheduled-match";
import type { Competition } from "@/domain/types";

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

/** 返回错误文案；可以录入这一桌时返回 null。 */
export async function competitionMatchEntryError(competition: Competition, scheduleId: string) {
  if (!await canEnterCompetitionMatches(competition.id)) return "当前账号没有该比赛的牌谱录入权限";
  if (await isAdmin()) return null;
  const player = await currentPlayer();
  if (!player) return "请先登录后再录入牌谱";
  if (!player.personId) return "该账号还没有绑定人物，请联系管理员绑定后再录入";
  // 个人赛按桌次录入：只能给自己那桌录，不能替其他桌提交成绩。
  if (competition.format !== "individual") return null;
  const table = (competition.individualSchedule ?? []).find((item) => item.id === scheduleId);
  if (!table) return "请从具体赛程卡片选择要录入的对局";
  if (!tableHasParticipant(competition, table, player.personId)) return "只能录入自己所在桌次的牌谱";
  return null;
}
