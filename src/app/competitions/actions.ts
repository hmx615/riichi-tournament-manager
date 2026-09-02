"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import type { Competition, Participant } from "@/domain/types";
import { listPeople } from "@/server/person-repository";

export type CreateCompetitionState = { message: string; fieldErrors?: Record<string, string[]> };

const participantSchema = z.object({
  displayName: z.string().trim().min(1, "请填写显示名称").max(30),
  personId: z.string().regex(/^[a-z0-9-]+$/, "请选择人物身份"),
  username: z.string().trim().min(1, "请填写确认用户名").max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色格式无效"),
});

const competitionSchema = z.object({
  name: z.string().trim().min(2, "比赛名称至少需要两个字符").max(80),
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9-]+$/, "比赛代号仅允许英文、数字和连字符"),
  plannedMatchCount: z.coerce.number().int().min(1).max(10000),
  initialPoints: z.coerce.number().int().min(0).max(100000),
  rankPoints: z.string().transform((value) => value.split(/[,，\s]+/).filter(Boolean).map(Number))
    .refine((value) => value.length === 4 && value.every(Number.isFinite), "请填写四个顺位马点"),
  participants: z.array(participantSchema).length(4),
});

export async function createCompetitionAction(
  _previousState: CreateCompetitionState,
  formData: FormData,
): Promise<CreateCompetitionState> {
  if (!await isAdmin()) return { message: "需要管理员登录。" };

  const raw = {
    name: formData.get("name"),
    code: formData.get("code"),
    plannedMatchCount: formData.get("plannedMatchCount"),
    initialPoints: formData.get("initialPoints"),
    rankPoints: formData.get("rankPoints"),
    participants: [0, 1, 2, 3].map((index) => ({
      displayName: formData.get(`participantName${index}`),
      personId: formData.get(`participantPersonId${index}`),
      username: formData.get(`participantUsername${index}`),
      color: formData.get(`participantColor${index}`),
    })),
  };
  const parsed = competitionSchema.safeParse(raw);
  if (!parsed.success) {
    return { message: "请检查表单中的必填项。", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const id = parsed.data.code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const people = await listPeople();
  const personById = new Map(people.map((person) => [person.id, person]));
  if (new Set(parsed.data.participants.map((participant) => participant.personId)).size !== 4) return { message: "四名参赛选手必须关联不同人物。" };
  if (parsed.data.participants.some((participant) => !personById.has(participant.personId))) return { message: "参赛人物不存在，请刷新后重试。" };
  const participants: Participant[] = parsed.data.participants.map((participant, index) => ({
    id: `player-${index + 1}`,
    personId: participant.personId,
    displayName: participant.displayName,
    kind: personById.get(participant.personId)!.kind,
    color: participant.color.toLowerCase(),
    usernames: [participant.username],
  }));
  const rankPoints = parsed.data.rankPoints as [number, number, number, number];
  const competition: Competition = {
    id,
    name: parsed.data.name,
    code: parsed.data.code.toUpperCase(),
    status: "draft",
    plannedMatchCount: parsed.data.plannedMatchCount,
    initialPoints: parsed.data.initialPoints,
    rankPoints,
    participants,
    matches: [],
  };

  try {
    await createCompetition(competition);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "比赛保存失败" };
  }
  revalidatePath("/");
  redirect(`/competitions/${id}`);
}
