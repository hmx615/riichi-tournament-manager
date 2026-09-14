"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { getCompetition, updateCompetition } from "@/server/competition-repository";
import { individualStageStandings } from "@/domain/individual-standings";
import { generateIndividualSchedule } from "@/domain/individual-schedule";

const schema = z.object({ competitionId: z.string().regex(/^[a-z0-9-]+$/), scheduleId: z.string().min(1), scheduledAt: z.string().min(1), tableNumber: z.coerce.number().int().min(1), participantIds: z.array(z.string()).length(4) });

export async function updateScheduleAction(formData: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse({ competitionId: formData.get("competitionId"), scheduleId: formData.get("scheduleId"), scheduledAt: formData.get("scheduledAt"), tableNumber: formData.get("tableNumber"), participantIds: formData.getAll("participantIds") });
  if (!parsed.success) throw new Error("赛程数据无效");
  if (new Set(parsed.data.participantIds).size !== 4) throw new Error("同一桌不能重复安排选手");
  const competition = await getCompetition(parsed.data.competitionId);
  if (!competition?.individualSchedule) throw new Error("该比赛没有独立赛程");
  const target = competition.individualSchedule.find((table) => table.id === parsed.data.scheduleId);
  if (!target) throw new Error("找不到赛程桌次");
  target.scheduledAt = new Date(parsed.data.scheduledAt).toISOString();
  target.tableNumber = parsed.data.tableNumber;
  target.participantIds = parsed.data.participantIds;
  await updateCompetition(competition);
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/schedule`);
  redirect(`/competitions/${competition.id}/schedule`);
}

export async function confirmStageAction(formData: FormData) {
  await requireAdmin();
  const competitionId = String(formData.get("competitionId") || "");
  const stage = String(formData.get("stage") || "");
  if (stage !== "preliminary" && stage !== "semifinal") throw new Error("阶段无效");
  const competition = await getCompetition(competitionId);
  if (!competition?.individualSettings) throw new Error("不是个人赛");
  const completed = competition.matches.filter((match) => match.status === "completed" && match.stage === stage);
  if (!completed.length) redirect(`/competitions/${competition.id}/schedule?error=${encodeURIComponent("该阶段尚未完成任何牌谱")}`);
  const settings = competition.individualSettings;
  const count = stage === "preliminary" ? settings.stages.preliminary.advancingPlayerCount ?? 0 : settings.semifinalAdvancingPlayerCount ?? settings.stages.semifinal.advancingPlayerCount ?? 0;
  if (!count) redirect(`/competitions/${competition.id}/schedule?error=${encodeURIComponent("尚未设置晋级人数，请先在比赛设置中填写")}`);
  const nextStage = stage === "preliminary" ? "semifinal" : "final";
  if (competition.individualSchedule?.some((table) => table.stage === nextStage)) throw new Error("下一阶段赛程已经生成");
  const ids = individualStageStandings(competition, stage).slice(0, count).map((row) => row.participant.id);
  const games = settings.stages[nextStage].matchCountPerPlayer;
  const generated = generateIndividualSchedule(ids, nextStage, games).map((table, index) => ({ ...table, id: `${competition.id}-${nextStage}-${table.round}-${table.tableNumber}`, scheduledAt: new Date(Date.UTC(2026, 8, 19 + index, 12)).toISOString(), timezone: "Asia/Shanghai", status: "scheduled" as const }));
  competition.individualSchedule = [...(competition.individualSchedule ?? []), ...generated];
  await updateCompetition(competition);
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/schedule`);
  redirect(`/competitions/${competition.id}/schedule`);
}
