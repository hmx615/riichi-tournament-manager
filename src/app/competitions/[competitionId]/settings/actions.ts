"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteCompetition, getCompetition, updateCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import { listPeople } from "@/server/person-repository";
import { hasDuplicateHumanParticipants } from "@/domain/participant-validation";
import { isValidPersonId } from "../../../../domain/person-id";

export type CompetitionSettingsState = { status: "idle" | "error" | "success"; message: string; redirectTo?: string; fieldErrors?: Record<string, string[]>; values?: Record<string, string> };
function formValues(formData: FormData) { return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string])); }
export type DeleteCompetitionState = { status: "idle" | "error"; message: string };

const schema = z.object({
  competitionId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2, "比赛名称至少需要两个字符").max(80),
  format: z.enum(["four_player", "individual"]),
  participantCount: z.coerce.number().int().min(4).max(200),
  status: z.enum(["draft", "active", "completed", "archived"]),
  plannedMatchCount: z.coerce.number().int().min(1).max(10000),
  initialPoints: z.coerce.number().int().min(0).max(100000),
  rankPoints: z.string().transform((value) => value.split(/[,，\s]+/).filter(Boolean).map(Number))
    .refine((value) => value.length === 4 && value.every(Number.isFinite), "请填写四个顺位马点"),
  participants: z.array(z.object({
    displayName: z.string().trim().min(1).max(30),
    personId: z.string().trim().min(1, "请选择人物身份").refine(isValidPersonId, "请选择人物身份"),
    usernames: z.string().transform((value) => value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean))
      .refine((value) => value.length > 0, "每个参赛席位至少需要一个牌谱用户名"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })).min(4).max(200),
  preliminaryMatches: z.coerce.number().int().min(0).max(1000),
  semifinalMatches: z.coerce.number().int().min(0).max(1000),
  finalMatches: z.coerce.number().int().min(0).max(1000),
});

async function saveCompetitionSettings(
  _state: CompetitionSettingsState,
  formData: FormData,
): Promise<CompetitionSettingsState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  const format = formData.get("format") === "individual" ? "individual" : "four_player";
  const participantCount = Number(formData.get("participantCount") || 4);
  const parsed = schema.safeParse({
    competitionId: formData.get("competitionId"),
    name: formData.get("name"),
    format,
    participantCount,
    status: formData.get("status"),
    plannedMatchCount: formData.get("plannedMatchCount"),
    initialPoints: formData.get("initialPoints"),
    rankPoints: formData.get("rankPoints"),
    participants: Array.from({ length: participantCount }, (_, index) => ({
      displayName: formData.get(`participantName${index}`),
      personId: formData.get(`participantPersonId${index}`),
      usernames: formData.get(`participantUsernames${index}`),
      color: formData.get(`participantColor${index}`),
    })),
    preliminaryMatches: formData.get("preliminaryMatches") || 0,
    semifinalMatches: formData.get("semifinalMatches") || 0,
    finalMatches: formData.get("finalMatches") || 0,
  });
  if (!parsed.success) return { status: "error", message: "请修正标红字段后再保存", fieldErrors: z.flattenError(parsed.error).fieldErrors, values: formValues(formData) };
  const competition = await getCompetition(parsed.data.competitionId);
  if (!competition) return { status: "error", message: "比赛不存在" };
  const currentFormat = competition.format || "four_player";
  if (parsed.data.format !== currentFormat) return { status: "error", message: "赛事类型创建后不能修改" };
  if (parsed.data.participantCount !== competition.participants.length || parsed.data.participants.length !== competition.participants.length) {
    return { status: "error", message: "报名人数创建后不能修改" };
  }
  if (competition.matches.length && (
    competition.initialPoints !== parsed.data.initialPoints
    || competition.rankPoints.some((value, index) => value !== parsed.data.rankPoints[index])
  )) return { status: "error", message: "已有对局后不能修改原点或顺位马点" };
  const people = await listPeople();
  const personById = new Map(people.map((person) => [person.id, person]));
  if (parsed.data.participants.some((participant) => !personById.has(participant.personId))) return { status: "error", message: "参赛人物不存在，请刷新后重试" };
  if (currentFormat === "individual" && new Set(parsed.data.participants.map((participant) => participant.personId)).size !== parsed.data.participants.length) {
    return { status: "error", message: "个人赛中同一人物不能重复报名" };
  }
  if (hasDuplicateHumanParticipants(parsed.data.participants.map((participant) => participant.personId), people)) {
    return { status: "error", message: "同一人类人物不能占据多个参赛席位；AI 人物可以重复" };
  }

  competition.name = parsed.data.name;
  competition.status = parsed.data.status;
  competition.plannedMatchCount = parsed.data.plannedMatchCount;
  competition.initialPoints = parsed.data.initialPoints;
  competition.rankPoints = parsed.data.rankPoints as [number, number, number, number];
  if (currentFormat === "individual") {
    competition.individualSettings = {
      stages: {
        preliminary: { matchCountPerPlayer: parsed.data.preliminaryMatches },
        semifinal: { matchCountPerPlayer: parsed.data.semifinalMatches },
        final: { matchCountPerPlayer: parsed.data.finalMatches },
      },
      pairingMode: "balanced_opponents",
    };
  }
  competition.participants = competition.participants.map((participant, index) => ({
    ...participant,
    personId: parsed.data.participants[index].personId,
    displayName: parsed.data.participants[index].displayName,
    usernames: parsed.data.participants[index].usernames,
    kind: personById.get(parsed.data.participants[index].personId)!.kind,
    color: parsed.data.participants[index].color.toLowerCase(),
  }));
  try {
    await updateCompetition(competition);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "比赛设置保存失败" };
  }
  revalidatePath("/");
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/data`);
  return { status: "success", message: "保存成功", redirectTo: `/competitions/${competition.id}` };
}
export const saveCompetitionSettingsAction = saveCompetitionSettings;

export async function deleteCompetitionAction(
  competitionId: string,
  _state: DeleteCompetitionState,
  formData: FormData,
): Promise<DeleteCompetitionState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  if (!/^[a-z0-9-]+$/.test(competitionId)) return { status: "error", message: "比赛 ID 格式无效" };
  const competition = await getCompetition(competitionId);
  if (!competition) return { status: "error", message: "比赛不存在或已经删除" };
  if (formData.get("confirmation") !== competition.code) {
    return { status: "error", message: `请输入比赛代号 ${competition.code} 确认删除` };
  }
  try {
    await deleteCompetition(competitionId);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "比赛删除失败" };
  }
  revalidatePath("/");
  revalidatePath("/players");
  redirect("/");
}
