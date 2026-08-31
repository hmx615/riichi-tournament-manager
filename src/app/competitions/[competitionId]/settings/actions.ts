"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompetition, updateCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";

export type CompetitionSettingsState = { status: "idle" | "error"; message: string };

const schema = z.object({
  competitionId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2, "比赛名称至少需要两个字符").max(80),
  status: z.enum(["draft", "active", "completed", "archived"]),
  plannedMatchCount: z.coerce.number().int().min(1).max(10000),
  initialPoints: z.coerce.number().int().min(0).max(100000),
  rankPoints: z.string().transform((value) => value.split(/[,，\s]+/).filter(Boolean).map(Number))
    .refine((value) => value.length === 4 && value.every(Number.isFinite), "请填写四个顺位马点"),
  participants: z.array(z.object({
    displayName: z.string().trim().min(1).max(30),
    usernames: z.string().transform((value) => value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean))
      .refine((value) => value.length > 0, "每名选手至少需要一个天凤用户名"),
    kind: z.enum(["human", "ai"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })).length(4),
});

export async function saveCompetitionSettingsAction(
  _state: CompetitionSettingsState,
  formData: FormData,
): Promise<CompetitionSettingsState> {
  if (!await isAdmin()) return { status: "error", message: "需要管理员登录" };
  const parsed = schema.safeParse({
    competitionId: formData.get("competitionId"),
    name: formData.get("name"),
    status: formData.get("status"),
    plannedMatchCount: formData.get("plannedMatchCount"),
    initialPoints: formData.get("initialPoints"),
    rankPoints: formData.get("rankPoints"),
    participants: [0, 1, 2, 3].map((index) => ({
      displayName: formData.get(`participantName${index}`),
      usernames: formData.get(`participantUsernames${index}`),
      kind: formData.get(`participantKind${index}`),
      color: formData.get(`participantColor${index}`),
    })),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message || "比赛设置格式无效" };
  const competition = await getCompetition(parsed.data.competitionId);
  if (!competition) return { status: "error", message: "比赛不存在" };
  if (competition.matches.length && (
    competition.initialPoints !== parsed.data.initialPoints
    || competition.rankPoints.some((value, index) => value !== parsed.data.rankPoints[index])
  )) return { status: "error", message: "已有对局后不能修改原点或顺位马点" };

  competition.name = parsed.data.name;
  competition.status = parsed.data.status;
  competition.plannedMatchCount = parsed.data.plannedMatchCount;
  competition.initialPoints = parsed.data.initialPoints;
  competition.rankPoints = parsed.data.rankPoints as [number, number, number, number];
  competition.participants = competition.participants.map((participant, index) => ({
    ...participant,
    displayName: parsed.data.participants[index].displayName,
    usernames: parsed.data.participants[index].usernames,
    kind: parsed.data.participants[index].kind,
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
  redirect(`/competitions/${competition.id}`);
}
