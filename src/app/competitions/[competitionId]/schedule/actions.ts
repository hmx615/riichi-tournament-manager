"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { getCompetition, updateCompetition } from "@/server/competition-repository";
import { individualStageStandings } from "@/domain/individual-standings";
import { planIndividualSchedule } from "@/domain/individual-schedule";
import { expireNegotiation, formatTableTime, overrideTime, parseTableTimeInput, setNegotiationDeadline } from "@/domain/schedule-negotiation";
import { updateTableNegotiation } from "@/server/negotiation";
import { generateCompetitionAccessCodes } from "@/server/negotiation";

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
  // 已经录入牌谱的桌次不能换人：牌谱里的座次与统计都绑在这四人身上。
  const recorded = competition.matches.some((match) => match.scheduleId === target.id || (
    match.stage === target.stage && match.round === target.round && match.tableNumber === target.tableNumber
  ));
  if (recorded) {
    const changed = new Set(target.participantIds).size !== new Set(parsed.data.participantIds).size
      || parsed.data.participantIds.some((id) => !target.participantIds.includes(id));
    if (changed) redirect(`/competitions/${competition.id}/schedule?error=${encodeURIComponent("该桌已经录入牌谱，不能更换选手；如需换人请先删除该场牌谱")}`);
  }
  target.scheduledAt = new Date(parsed.data.scheduledAt).toISOString();
  target.tableNumber = parsed.data.tableNumber;
  target.participantIds = parsed.data.participantIds;
  // 管理员改时间等于调整法定时间：协商记录里的法定时间要跟着走，否则选手页面会显示旧时间。
  if (target.negotiation) {
    const updatedAt = new Date().toISOString();
    const effective = ["legal_time", "proposal_pending"].includes(target.negotiation.status);
    target.negotiation = {
      ...target.negotiation,
      legalTime: target.scheduledAt,
      currentTime: effective ? target.scheduledAt : target.negotiation.currentTime,
      history: [...target.negotiation.history, {
        at: updatedAt,
        actor: "admin",
        action: "deadline",
        detail: `管理员把法定时间调整为 ${formatTableTime(target.scheduledAt)}`,
      }],
    };
  }
  await updateCompetition(competition);
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/schedule`);
  redirect(`/competitions/${competition.id}/schedule`);
}

function scheduleErrorRedirect(competitionId: string, message: string) {
  redirect(`/competitions/${competitionId}/schedule?error=${encodeURIComponent(message)}`);
}

/** 管理员设置协商截止时间与候选时间（不会清掉选手已经确认的状态）。 */
export async function setNegotiationDeadlineAction(formData: FormData) {
  await requireAdmin();
  const competitionId = String(formData.get("competitionId") || "");
  const scheduleId = String(formData.get("scheduleId") || "");
  const candidateTimes = [0, 1, 2].map((index) => String(formData.get(`candidateTime${index}`) || ""))
    .filter((value) => value.trim().length > 0)
    .map((value) => parseTableTimeInput(value))
    .filter((value): value is string => Boolean(value));
  const deadlineInput = String(formData.get("deadline") || "");
  const deadline = deadlineInput ? parseTableTimeInput(deadlineInput) : null;
  try {
    await updateTableNegotiation(competitionId, scheduleId, (negotiation) => setNegotiationDeadline(negotiation, {
      candidateTimes,
      deadline: deadline ?? undefined,
      at: new Date().toISOString(),
    }));
  } catch (error) {
    scheduleErrorRedirect(competitionId, error instanceof Error ? error.message : "保存协商设置失败");
  }
  redirect(`/competitions/${competitionId}/schedule?saved=1`);
}

/** 管理员在特殊情况下强制调整时间，必须填写原因，原定时间会保留在协商记录里。 */
export async function overrideScheduleTimeAction(formData: FormData) {
  await requireAdmin();
  const competitionId = String(formData.get("competitionId") || "");
  const scheduleId = String(formData.get("scheduleId") || "");
  const time = parseTableTimeInput(String(formData.get("overrideTime") || ""));
  const reason = String(formData.get("overrideReason") || "");
  if (!time) scheduleErrorRedirect(competitionId, "请填写要调整到的时间");
  try {
    await updateTableNegotiation(competitionId, scheduleId, (negotiation) => overrideTime(negotiation, { time: time!, reason, at: new Date().toISOString() }));
  } catch (error) {
    scheduleErrorRedirect(competitionId, error instanceof Error ? error.message : "强制调整失败");
  }
  redirect(`/competitions/${competitionId}/schedule?saved=1#${encodeURIComponent(scheduleId)}`);
}

/** 协商截止：按法定时间进行。 */
export async function expireNegotiationAction(formData: FormData) {
  await requireAdmin();
  const competitionId = String(formData.get("competitionId") || "");
  const scheduleId = String(formData.get("scheduleId") || "");
  try {
    await updateTableNegotiation(competitionId, scheduleId, (negotiation) => expireNegotiation(negotiation, new Date().toISOString()));
  } catch (error) {
    scheduleErrorRedirect(competitionId, error instanceof Error ? error.message : "结束协商失败");
  }
  redirect(`/competitions/${competitionId}/schedule?saved=1#${encodeURIComponent(scheduleId)}`);
}

export type AccessCodesState = {
  error: string;
  codes: Array<{ participantId: string; code: string }>;
};

/** 生成（或重置）本届所有选手的 8 位口令，明文只在这次响应里返回一次。 */
export async function generateAccessCodesAction(_state: AccessCodesState, formData: FormData): Promise<AccessCodesState> {
  await requireAdmin();
  const competitionId = String(formData.get("competitionId") || "");
  try {
    return { error: "", codes: await generateCompetitionAccessCodes(competitionId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "生成口令失败", codes: [] };
  }
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
  // 晋级人数不是 4 的倍数时（例如 6 人晋级），允许部分选手少打一个半庄并记为轮空。
  const plan = planIndividualSchedule(ids, nextStage, games, { allowUnevenGames: true });
  const generated = plan.tables.map((table, index) => ({ ...table, id: `${competition.id}-${nextStage}-${table.round}-${table.tableNumber}`, scheduledAt: new Date(Date.UTC(2026, 8, 19 + index, 12)).toISOString(), timezone: "Asia/Shanghai", status: "scheduled" as const }));
  competition.individualSchedule = [...(competition.individualSchedule ?? []), ...generated];
  competition.individualByes = [...(competition.individualByes ?? []), ...plan.byes];
  await updateCompetition(competition);
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/schedule`);
  redirect(`/competitions/${competition.id}/schedule`);
}
