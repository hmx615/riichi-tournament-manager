import "server-only";

import { redirect } from "next/navigation";
import { isAdmin } from "@/server/auth";

/**
 * 比赛牌谱录入只给管理员：成绩直接决定积分榜和每周淘汰名单，
 * 选手账号一律只读，散排（/casual）另算，那里本来就按人物隔离。
 */
export async function canEnterCompetitionMatches(_competitionId: string) {
  return await isAdmin();
}

export async function requireCompetitionMatchEntryPage(competitionId: string, returnPath: string) {
  if (await canEnterCompetitionMatches(competitionId)) return;
  const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
  redirect(`/login?next=${encodeURIComponent(safePath)}`);
}
