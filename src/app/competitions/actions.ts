"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import type { Competition, IndividualCompetitionSettings, Participant, Person } from "@/domain/types";
import { listPeople } from "@/server/person-repository";
import { listPersonTags } from "@/server/person-tag-repository";
import { hasDuplicateHumanParticipants } from "@/domain/participant-validation";
import { isValidPersonId } from "@/domain/person-id";
import { normalizePersonTags, personTags } from "@/domain/person-tags";
import { defaultIndividualPreliminary } from "@/domain/competition-format";
import { individualPreliminaryWeekCount, planPreliminaryRegularWeeks } from "@/domain/individual-tournament";

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
  creationType: z.enum(["four_player", "individual", "match_pool"]),
  participantCount: z.coerce.number().int().min(0).max(200),
  plannedMatchCount: z.coerce.number().int().min(1).max(100000),
  initialPoints: z.coerce.number().int().min(0).max(100000),
  rankPoints: z.string().transform((value) => value.split(/[,，\s]+/).filter(Boolean).map(Number))
    .refine((value) => value.length === 4 && value.every(Number.isFinite), "请填写四个顺位马点"),
  participants: z.array(participantSchema).max(200),
  autoIncludePersonTags: z.array(z.string()),
  /** 初赛日常周数（这段时间不淘汰）。 */
  regularWeeks: z.coerce.number().int().min(0).max(52),
  /** 淘汰周数，每周结算一次淘汰。 */
  eliminationWeeks: z.coerce.number().int().min(0).max(52),
  /** 每周每人半庄数，也是每周的轮数。 */
  matchesPerPlayerPerWeek: z.coerce.number().int().min(1).max(20),
  /** 每周淘汰人数。 */
  eliminationCountPerWeek: z.coerce.number().int().min(0).max(50),
  /** 决赛人数。 */
  finalistCount: z.coerce.number().int().min(4).max(50),
  finalMatches: z.coerce.number().int().min(0).max(1000),
  /** 第一周的第一个比赛日（周日）。 */
  startDate: z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : undefined), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请填写开赛日（第一周周日）").optional()),
});

function poolParticipant(person: Person): Participant {
  return {
    id: `person-${person.id}`,
    personId: person.id,
    displayName: person.displayName,
    kind: person.kind,
    color: person.color,
    usernames: [...new Set([person.displayName, ...person.aliases, ...person.accounts.map((account) => account.username)])],
  };
}

/** 没填开赛日时退回下一个周日，保证排期不会算出非法时间。 */
function defaultStartDate(now = new Date()) {
  const nextSunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((7 - now.getUTCDay()) % 7)));
  return nextSunday.toISOString().slice(0, 10);
}

export async function createCompetitionAction(_previousState: CreateCompetitionState, formData: FormData): Promise<CreateCompetitionState> {
  if (!await isAdmin()) return { message: "需要管理员登录。" };
  const requestedType = String(formData.get("creationType"));
  const creationType = requestedType === "individual" || requestedType === "match_pool" ? requestedType : "four_player";
  const participantCount = creationType === "match_pool" ? 0 : Number(formData.get("participantCount") || 4);
  const raw = {
    name: formData.get("name"), code: formData.get("code"), creationType, participantCount,
    plannedMatchCount: formData.get("plannedMatchCount"), initialPoints: formData.get("initialPoints"), rankPoints: formData.get("rankPoints"),
    participants: Array.from({ length: participantCount }, (_, index) => ({ displayName: formData.get(`participantName${index}`), personId: formData.get(`participantPersonId${index}`), username: formData.get(`participantUsername${index}`), color: formData.get(`participantColor${index}`) })),
    autoIncludePersonTags: normalizePersonTags(formData.getAll("autoIncludePersonTags").filter((value): value is string => typeof value === "string")),
    regularWeeks: formData.get("regularWeeks") || defaultIndividualPreliminary.regularWeeks,
    eliminationWeeks: formData.get("eliminationWeeks") || defaultIndividualPreliminary.eliminationWeeks,
    matchesPerPlayerPerWeek: formData.get("matchesPerPlayerPerWeek") || defaultIndividualPreliminary.matchesPerPlayerPerWeek,
    eliminationCountPerWeek: formData.get("eliminationCountPerWeek") || defaultIndividualPreliminary.eliminationCountPerWeek,
    finalistCount: formData.get("finalistCount") || defaultIndividualPreliminary.finalistCount,
    finalMatches: formData.get("finalMatches") || 0,
    startDate: formData.get("startDate") || "",
  };
  const parsed = competitionSchema.safeParse(raw);
  if (!parsed.success) {
    const values = Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, value as string]));
    return { message: "请检查表单中的必填项。", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  const matchPool = parsed.data.creationType === "match_pool";
  const individual = parsed.data.creationType === "individual";
  if (!matchPool && parsed.data.participants.length !== parsed.data.participantCount) return { message: "参赛选手数量与报名人数不一致。" };
  if (parsed.data.creationType === "four_player" && parsed.data.participantCount !== 4) return { message: "四人对局赛必须登记 4 名参赛选手。" };
  if (individual) {
    if (parsed.data.participantCount % 4 !== 0) return { message: "个人赛报名人数必须是 4 的倍数（每桌 4 人）。" };
    const survivors = parsed.data.participantCount - parsed.data.eliminationCountPerWeek * parsed.data.eliminationWeeks;
    if (survivors < parsed.data.finalistCount) {
      return { message: `按每周淘汰 ${parsed.data.eliminationCountPerWeek} 人淘汰 ${parsed.data.eliminationWeeks} 周，最后只剩 ${survivors} 人，少于决赛人数 ${parsed.data.finalistCount} 人。` };
    }
    if (survivors % 4 !== 0) return { message: `淘汰到最后剩 ${survivors} 人，不是 4 的倍数，凑不齐一桌。` };
  }

  const [people, availableTags] = await Promise.all([listPeople(), listPersonTags()]);
  const personById = new Map(people.map((person) => [person.id, person]));
  if (matchPool) {
    if (!parsed.data.autoIncludePersonTags.length) return { message: "匹配池至少选择一个自动加入标签。" };
    if (parsed.data.autoIncludePersonTags.some((tag) => !availableTags.includes(tag))) return { message: "人物标签已变更，请刷新后重新选择。" };
  } else {
    if (parsed.data.participants.some((participant) => !personById.has(participant.personId))) return { message: "参赛人物不存在，请刷新后重试。" };
    if (individual && new Set(parsed.data.participants.map((participant) => participant.personId)).size !== parsed.data.participants.length) return { message: "个人赛中同一人物不能重复报名。" };
    if (hasDuplicateHumanParticipants(parsed.data.participants.map((participant) => participant.personId), people)) return { message: "同一人类人物不能占据多个参赛席位；AI 人物可以重复。" };
  }

  const participants: Participant[] = matchPool
    ? people.filter((person) => personTags(person).some((tag) => parsed.data.autoIncludePersonTags.includes(tag))).map(poolParticipant)
    : parsed.data.participants.map((participant, index) => ({ id: `player-${index + 1}`, personId: participant.personId, displayName: participant.displayName, kind: personById.get(participant.personId)!.kind, color: participant.color.toLowerCase(), usernames: [participant.username] }));
  if (matchPool && participants.length < 4) return { message: `所选标签当前只有 ${participants.length} 人，匹配池至少需要 4 人。` };

  const id = parsed.data.code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const rankPoints = parsed.data.rankPoints as [number, number, number, number];
  const individualSettings: IndividualCompetitionSettings | undefined = individual ? {
    preliminary: {
      regularWeeks: parsed.data.regularWeeks,
      eliminationWeeks: parsed.data.eliminationWeeks,
      matchesPerPlayerPerWeek: parsed.data.matchesPerPlayerPerWeek,
      eliminationCountPerWeek: parsed.data.eliminationCountPerWeek,
      finalistCount: parsed.data.finalistCount,
      legalWeekdays: defaultIndividualPreliminary.legalWeekdays,
      legalTimes: defaultIndividualPreliminary.legalTimes,
      startDate: parsed.data.startDate ?? defaultStartDate(),
    },
    final: { matchCountPerPlayer: parsed.data.finalMatches },
    pairingMode: "balanced_opponents",
  } : undefined;
  const competition: Competition = {
    id, name: parsed.data.name, code: parsed.data.code.toUpperCase(), format: individual ? "individual" : "four_player", status: matchPool ? "active" : "draft",
    plannedMatchCount: matchPool ? 100000 : parsed.data.plannedMatchCount, initialPoints: parsed.data.initialPoints, rankPoints, participants, matches: [],
    ...(matchPool ? { autoIncludePersonTags: parsed.data.autoIncludePersonTags } : {}), individualSettings,
  };
  if (individual && individualSettings) {
    // 开赛时一次排完日常周；淘汰周的桌次等每周结算淘汰名单后再生成。
    const regular = planPreliminaryRegularWeeks(competition, individualSettings);
    competition.individualSchedule = regular.tables;
    if (regular.byes.length) competition.individualByes = regular.byes;
  }
  try { await createCompetition(competition); } catch (error) { return { message: error instanceof Error ? error.message : "比赛保存失败" }; }
  revalidatePath("/");
  redirect(`/competitions/${id}`);
}
