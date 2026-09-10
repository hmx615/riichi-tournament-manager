"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import type { Competition, IndividualCompetitionSettings, Participant } from "@/domain/types";
import { listPeople } from "@/server/person-repository";
import { hasDuplicateHumanParticipants } from "@/domain/participant-validation";
import { isValidPersonId } from "@/domain/person-id";

export type CreateCompetitionState = { message: string; fieldErrors?: Record<string, string[]>; values?: Record<string, string> };

const participantSchema = z.object({
  displayName: z.string().trim().min(1, "请填写显示名称").max(30),
  personId: z.string().trim().min(1, "请选择人物身份").refine(isValidPersonId, "请选择人物身份"),
  username: z.string().trim().min(1, "请填写牌谱用户名").max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色格式无效"),
});

const competitionSchema = z.object({
  name: z.string().trim().min(2, "比赛名称至少需要两个字符").max(80),
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9-]+$/, "比赛代号仅允许英文、数字和连字符"),
  format: z.enum(["four_player", "individual"]),
  participantCount: z.coerce.number().int().min(4).max(200),
  plannedMatchCount: z.coerce.number().int().min(1).max(10000),
  initialPoints: z.coerce.number().int().min(0).max(100000),
  rankPoints: z.string().transform((value) => value.split(/[,，\s]+/).filter(Boolean).map(Number))
    .refine((value) => value.length === 4 && value.every(Number.isFinite), "请填写四个顺位马点"),
  participants: z.array(participantSchema).min(4).max(200),
  preliminaryMatches: z.coerce.number().int().min(0).max(1000),
  semifinalMatches: z.coerce.number().int().min(0).max(1000),
  finalMatches: z.coerce.number().int().min(0).max(1000),
});

export async function createCompetitionAction(
  _previousState: CreateCompetitionState,
  formData: FormData,
): Promise<CreateCompetitionState> {
  if (!await isAdmin()) return { message: "需要管理员登录。" };

  const format = formData.get("format") === "individual" ? "individual" : "four_player";
  const participantCount = Number(formData.get("participantCount") || 4);
  const raw = {
    name: formData.get("name"),
    code: formData.get("code"),
    format,
    participantCount,
    plannedMatchCount: formData.get("plannedMatchCount"),
    initialPoints: formData.get("initialPoints"),
    rankPoints: formData.get("rankPoints"),
    participants: Array.from({ length: participantCount }, (_, index) => ({
      displayName: formData.get(`participantName${index}`),
      personId: formData.get(`participantPersonId${index}`),
      username: formData.get(`participantUsername${index}`),
      color: formData.get(`participantColor${index}`),
    })),
    preliminaryMatches: formData.get("preliminaryMatches") || 0,
    semifinalMatches: formData.get("semifinalMatches") || 0,
    finalMatches: formData.get("finalMatches") || 0,
  };
  const parsed = competitionSchema.safeParse(raw);
  if (!parsed.success) {
    const values = Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, value as string]));
    return { message: "请检查表单中的必填项。", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  if (parsed.data.format === "four_player" && parsed.data.participantCount !== 4) {
    return { message: "四人对局赛必须登记 4 名参赛选手。" };
  }
  if (parsed.data.participants.length !== parsed.data.participantCount) {
    return { message: "参赛选手数量与报名人数不一致。" };
  }

  const id = parsed.data.code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const people = await listPeople();
  const personById = new Map(people.map((person) => [person.id, person]));
  if (parsed.data.participants.some((participant) => !personById.has(participant.personId))) return { message: "参赛人物不存在，请刷新后重试。" };
  if (parsed.data.format === "individual" && new Set(parsed.data.participants.map((participant) => participant.personId)).size !== parsed.data.participants.length) {
    return { message: "个人赛中同一人物不能重复报名。" };
  }
  if (hasDuplicateHumanParticipants(parsed.data.participants.map((participant) => participant.personId), people)) {
    return { message: "同一人类人物不能占据多个参赛席位；AI 人物可以重复。" };
  }
  const participants: Participant[] = parsed.data.participants.map((participant, index) => ({
    id: `player-${index + 1}`,
    personId: participant.personId,
    displayName: participant.displayName,
    kind: personById.get(participant.personId)!.kind,
    color: participant.color.toLowerCase(),
    usernames: [participant.username],
  }));
  const rankPoints = parsed.data.rankPoints as [number, number, number, number];
  const individualSettings: IndividualCompetitionSettings | undefined = parsed.data.format === "individual" ? {
    stages: {
      preliminary: { matchCountPerPlayer: parsed.data.preliminaryMatches },
      semifinal: { matchCountPerPlayer: parsed.data.semifinalMatches },
      final: { matchCountPerPlayer: parsed.data.finalMatches },
    },
    pairingMode: "balanced_opponents",
  } : undefined;
  const competition: Competition = {
    id,
    name: parsed.data.name,
    code: parsed.data.code.toUpperCase(),
    format: parsed.data.format,
    status: "draft",
    plannedMatchCount: parsed.data.plannedMatchCount,
    initialPoints: parsed.data.initialPoints,
    rankPoints,
    participants,
    matches: [],
    individualSettings,
  };

  try {
    await createCompetition(competition);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "比赛保存失败" };
  }
  revalidatePath("/");
  redirect(`/competitions/${id}`);
}
