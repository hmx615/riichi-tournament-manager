"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Competition, MatchRecord, NagaRating } from "@/domain/types";
import { appendMatch, getCompetition, listCompetitions, supplementMatchNagaAnalysis } from "@/server/competition-repository";
import { parseMatchSource, type MatchPreview } from "@/server/tenhou";
import { isAdmin } from "@/server/auth";

export type MatchEntryState = {
  status: "idle" | "success" | "error";
  message: string;
  preview: MatchPreview | null;
  operation: "create" | "supplement_naga" | null;
  targetMatchNumber: number | null;
};

const initialError = (message: string): MatchEntryState => ({ status: "error", message, preview: null, operation: null, targetMatchNumber: null });
const sourceSchema = z.string().trim().url("请输入完整的天凤或 NAGA 链接");
const competitionIdSchema = z.string().regex(/^[a-z0-9-]+$/, "比赛 ID 格式无效");

function competitionIdFrom(formData: FormData) {
  return competitionIdSchema.safeParse(formData.get("competitionId"));
}

async function findRecordedMatch(logId: string) {
  const competitions = await listCompetitions();
  for (const competition of competitions) {
    const match = competition.matches.find((item) => item.tenhouLogId === logId);
    if (match) return { competition, match };
  }
  return null;
}

function ratingsForParticipants(preview: MatchPreview, participantIds: string[], competition: Competition): NagaRating[] {
  const validIds = new Set(competition.participants.map((participant) => participant.id));
  return preview.nagaRatings.flatMap((rating) => {
    const participantId = participantIds[rating.seat];
    if (!validIds.has(participantId)) return [];
    return [{
      participantId,
      model: rating.model,
      rating: rating.rating,
      agreementRate: rating.agreementRate,
      badMoveRate: rating.badMoveRate,
      decisionCount: rating.decisionCount,
    }];
  });
}

function needsNagaSupplement(match: MatchRecord, ratings: NagaRating[]) {
  if (!match.nagaUrl || !match.nagaRatings?.length) return true;
  const existing = new Map(match.nagaRatings.map((rating) => [`${rating.participantId}\u0000${rating.model}`, rating]));
  return ratings.some((rating) => {
    const stored = existing.get(`${rating.participantId}\u0000${rating.model}`);
    return !stored || !Number.isFinite(stored.agreementRate) || !Number.isFinite(stored.badMoveRate);
  });
}

export async function parseMatchAction(_state: MatchEntryState, formData: FormData): Promise<MatchEntryState> {
  if (!await isAdmin()) return initialError("需要管理员登录");
  const competitionId = competitionIdFrom(formData);
  if (!competitionId.success) return initialError(competitionId.error.issues[0]?.message || "比赛 ID 格式无效");
  const source = sourceSchema.safeParse(formData.get("sourceUrl"));
  if (!source.success) return initialError(source.error.issues[0]?.message || "链接格式无效");
  const competition = await getCompetition(competitionId.data);
  if (!competition) return initialError("比赛数据不存在");
  try {
    const preview = await parseMatchSource(source.data, competition);
    const recorded = await findRecordedMatch(preview.logId);
    if (recorded) {
      const participantIds = [...recorded.match.seats].sort((left, right) => left.seat - right.seat).map((seat) => seat.participantId);
      const ratings = ratingsForParticipants(preview, participantIds, competition);
      if (preview.sourceType === "naga" && recorded.competition.id === competition.id && needsNagaSupplement(recorded.match, ratings)) {
        return {
          status: "success",
          message: `已匹配第 ${recorded.match.matchNumber} 场，将补充 NAGA 分析、Rating 与一致率`,
          preview,
          operation: "supplement_naga",
          targetMatchNumber: recorded.match.matchNumber,
        };
      }
      if (preview.sourceType === "naga" && recorded.match.nagaUrl) return initialError(`第 ${recorded.match.matchNumber} 场已经有 NAGA 分析`);
      return initialError(`该牌谱已经录入 ${recorded.competition.name}`);
    }
    const unresolved = preview.seats.filter((seat) => !seat.participantId).length;
    return {
      status: "success",
      message: unresolved ? `解析成功，${unresolved} 个座次需要手动确认` : "解析成功，四家身份已自动匹配",
      preview,
      operation: "create",
      targetMatchNumber: null,
    };
  } catch (error) {
    return initialError(error instanceof Error ? error.message : "牌谱解析失败");
  }
}

export async function saveMatchAction(_state: MatchEntryState, formData: FormData): Promise<MatchEntryState> {
  if (!await isAdmin()) return initialError("需要管理员登录");
  const competitionId = competitionIdFrom(formData);
  if (!competitionId.success) return initialError(competitionId.error.issues[0]?.message || "比赛 ID 格式无效");
  const source = sourceSchema.safeParse(formData.get("sourceUrl"));
  if (!source.success) return initialError(source.error.issues[0]?.message || "链接格式无效");
  const competition = await getCompetition(competitionId.data);
  if (!competition) return initialError("比赛数据不存在");
  try {
    const preview = await parseMatchSource(source.data, competition);
    const recorded = await findRecordedMatch(preview.logId);
    if (recorded) {
      if (preview.sourceType !== "naga") return initialError(`该牌谱已经录入 ${recorded.competition.name}`);
      if (recorded.competition.id !== competition.id) return initialError(`该牌谱已经录入 ${recorded.competition.name}`);
      if (!preview.nagaUrl || !preview.nagaReportId) return initialError("NAGA 报告信息不完整");
      const participantIds = [...recorded.match.seats].sort((left, right) => left.seat - right.seat).map((seat) => seat.participantId);
      const ratings = ratingsForParticipants(preview, participantIds, competition);
      if (!needsNagaSupplement(recorded.match, ratings)) return initialError(`第 ${recorded.match.matchNumber} 场已经有完整的 NAGA 数据`);
      await supplementMatchNagaAnalysis(
        competition.id,
        preview.logId,
        preview.nagaUrl,
        preview.nagaReportId,
        ratings,
      );
    } else {
      const participantIds = [0, 1, 2, 3].map((seat) => String(formData.get(`participant${seat}`) || ""));
      const validIds = new Set(competition.participants.map((participant) => participant.id));
      if (participantIds.some((id) => !validIds.has(id)) || new Set(participantIds).size !== 4) return initialError("四个座次必须分别选择四名不同选手");
      const matchNumber = Math.max(0, ...competition.matches.map((match) => match.matchNumber)) + 1;
      const match: MatchRecord = {
        id: `${competition.id}-${String(matchNumber).padStart(3, "0")}`,
        matchNumber,
        status: "completed",
        playedAt: preview.playedAt,
        tenhouLogId: preview.logId,
        tenhouUrl: preview.tenhouUrl,
        nagaUrl: preview.nagaUrl,
        nagaReportId: preview.nagaReportId,
        nagaRatings: ratingsForParticipants(preview, participantIds, competition),
        seats: preview.seats.map((seat) => ({
          seat: seat.seat,
          participantId: participantIds[seat.seat],
          sourceUsername: seat.sourceUsername,
          rawPoints: seat.rawPoints,
          rank: seat.rank,
          competitionPoints: seat.competitionPoints,
          assignmentSource: seat.participantId === participantIds[seat.seat] ? "alias" : "manual",
        })),
        reviewNote: null,
      };
      await appendMatch(competition.id, match);
    }
  } catch (error) {
    return initialError(error instanceof Error ? error.message : "牌谱保存失败");
  }
  revalidatePath("/");
  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath(`/competitions/${competition.id}/data`);
  redirect(`/competitions/${competition.id}`);
}
