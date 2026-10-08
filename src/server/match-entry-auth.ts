import "server-only";

import { redirect } from "next/navigation";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";
import { getCompetition } from "@/server/competition-repository";
import { tableHasParticipant } from "@/domain/scheduled-match";
import type { Competition } from "@/domain/types";

/**
 * 比赛牌谱录入：管理员随便录；选手账号只能录自己所在的那几桌，
 * 页面和 parse/save 两个 action 都按这个口径拦。
 */
export async function canEnterCompetitionMatches(_competitionId: string) {
  if (await isAdmin()) return true;
  return Boolean(await currentPlayer());
}

export async function requireCompetitionMatchEntryPage(competitionId: string, returnPath: string) {
  if (await canEnterCompetitionMatches(competitionId)) return;
  const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
  redirect(`/login?next=${encodeURIComponent(safePath)}`);
}

/** 返回错误文案；可以录这一桌时返回 null。 */
export async function competitionMatchEntryError(competition: Competition, scheduleId: string) {
  if (await isAdmin()) return null;
  const player = await currentPlayer();
  if (!player) return "请先登录后再录入牌谱";
  if (!player.personId) return "该账号还没有绑定人物，请联系管理员绑定后再录入";
  // 四席位对局赛沿用旧口径（选手可录）；个人赛按桌次隔离。
  if (competition.format !== "individual") return null;
  const table = (competition.individualSchedule ?? []).find((item) => item.id === scheduleId);
  if (!table) return "请从具体赛程卡片选择要录入的对局";
  if (!tableHasParticipant(competition, table, player.personId)) return "只能录入自己所在桌次的牌谱";
  return null;
}

/** 当前账号在这届能录哪几桌：管理员返回 null（表示全部）。 */
export async function enterableTablesForViewer(competition: Competition) {
  if (await isAdmin()) return null;
  const player = await currentPlayer();
  if (!player?.personId) return new Set<string>();
  return new Set((competition.individualSchedule ?? [])
    .filter((table) => tableHasParticipant(competition, table, player.personId!))
    .map((table) => table.id));
}
