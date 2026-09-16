import type { Competition, IndividualStage, Participant } from "./types";
import { scheduledMatch } from "./scheduled-match";

export type IndividualStanding = {
  participant: Participant;
  /** 当前积分：晋级进入新阶段后清零重新开始，所以等于最后参加的那个阶段里拿到的积分。 */
  points: number;
  /** 本阶段自身累计的积分。 */
  stagePoints: number;
  /** 带入积分：晋级清零后固定为 0，仅用于展示说明。 */
  carriedPoints: number;
  games: number;
  averageRank: number | null;
  /** 本阶段一位次数、二位次数，用于同分破平。 */
  firstPlaceCount: number;
  secondPlaceCount: number;
  rank: number;
  advancing: boolean;
};

/** 同分破平口径：积分 → 平均顺位 → 一位次数 → 二位次数 → 姓名。 */
export const individualTiebreakRule = "积分 → 平均顺位 → 一位次数 → 二位次数 → 姓名";

export type IndividualTiebreak = {
  points: number;
  averageRank: number | null;
  firstPlaceCount: number;
  secondPlaceCount: number;
  displayName: string;
};

export function compareIndividualTiebreak(left: IndividualTiebreak, right: IndividualTiebreak) {
  return right.points - left.points
    || (left.averageRank ?? Infinity) - (right.averageRank ?? Infinity)
    || right.firstPlaceCount - left.firstPlaceCount
    || right.secondPlaceCount - left.secondPlaceCount
    || left.displayName.localeCompare(right.displayName, "zh-CN");
}

const stageOrder = ["preliminary", "semifinal", "final"] as const;

export function individualStageRawPoints(competition: Competition, stage: IndividualStage) {
  const points = new Map<string, number>();
  for (const match of competition.matches) {
    if (match.status !== "completed" || match.stage !== stage) continue;
    for (const seat of match.seats) points.set(seat.participantId, (points.get(seat.participantId) ?? 0) + seat.competitionPoints);
  }
  return points;
}

/** 参加过某个阶段的选手：该阶段有排好的桌次，或者已经录入了该阶段的对局。 */
export function individualStageParticipants(competition: Competition, stage: IndividualStage) {
  const ids = new Set<string>();
  for (const table of competition.individualSchedule ?? []) {
    if (table.stage !== stage || table.status === "cancelled") continue;
    for (const id of table.participantIds) ids.add(id);
  }
  for (const match of competition.matches) {
    if (match.status !== "completed" || match.stage !== stage) continue;
    for (const seat of match.seats) ids.add(seat.participantId);
  }
  return ids;
}

/**
 * 当前积分：晋级进入下一阶段时积分清零、从零重新开始，所以分数等于最后参加的那个阶段的积分；
 * 没有进入下一阶段的选手视为已经淘汰，积分冻结在淘汰那一刻，不再变化。
 */
export function individualCurrentPoints(competition: Competition, stage: IndividualStage) {
  const totals = new Map(competition.participants.map((participant) => [participant.id, 0]));
  for (const current of stageOrder) {
    const raw = individualStageRawPoints(competition, current);
    const entered = individualStageParticipants(competition, current);
    for (const [id] of totals) {
      if (!entered.has(id)) continue;
      totals.set(id, raw.get(id) ?? 0);
    }
    if (current === stage) break;
  }
  return totals;
}

/** 当前进行到的阶段：已经排出下一阶段赛程就进入下一阶段。 */
export function individualActiveStage(competition: Competition): IndividualStage {
  const tables = competition.individualSchedule ?? [];
  if (tables.some((table) => table.stage === "final")) return "final";
  if (tables.some((table) => table.stage === "semifinal")) return "semifinal";
  return "preliminary";
}

/** 某个阶段是否已经打完：该阶段桌次全部完成（晋级名单此时已经确定）。 */
export function individualStageComplete(competition: Competition, stage: IndividualStage) {
  const tables = (competition.individualSchedule ?? []).filter((table) => table.stage === stage && table.status !== "cancelled");
  return tables.length > 0 && tables.every((table) => table.status === "completed" || Boolean(scheduledMatch(competition, table)));
}

export function individualStageStandings(competition: Competition, stage: IndividualStage): IndividualStanding[] {
  const settings = competition.individualSettings;
  const totals = individualCurrentPoints(competition, stage);
  const own = individualStageRawPoints(competition, stage);
  // 阶段积分榜只统计真正参加该阶段的选手；被淘汰的选手积分已经冻结，不参与本阶段排名和晋级。
  const entered = individualStageParticipants(competition, stage);
  const matches = competition.matches.filter((match) => match.status === "completed" && match.stage === stage);
  const rows = competition.participants.filter((participant) => entered.has(participant.id)).map((participant) => {
    const seats = matches.flatMap((match) => match.seats.filter((seat) => seat.participantId === participant.id));
    const rankTotal = seats.reduce((sum, seat) => sum + seat.rank, 0);
    const stagePoints = own.get(participant.id) ?? 0;
    const points = totals.get(participant.id) ?? 0;
    return {
      participant,
      points,
      stagePoints,
      carriedPoints: points - stagePoints,
      games: seats.length,
      averageRank: seats.length ? rankTotal / seats.length : null,
      firstPlaceCount: seats.filter((seat) => seat.rank === 1).length,
      secondPlaceCount: seats.filter((seat) => seat.rank === 2).length,
    };
  }).sort((left, right) => compareIndividualTiebreak(
    { ...left, displayName: left.participant.displayName },
    { ...right, displayName: right.participant.displayName },
  ));
  const advancingCount = stage === "preliminary" ? settings?.stages.preliminary.advancingPlayerCount ?? 0 : stage === "semifinal" ? settings?.semifinalAdvancingPlayerCount ?? settings?.stages.semifinal.advancingPlayerCount ?? 0 : 0;
  return rows.map((row, index) => ({ ...row, rank: index + 1, advancing: advancingCount > 0 && index < advancingCount }));
}

/** 只统计到某一轮为止的对局，得到该轮结束时的阶段积分榜快照。 */
export function individualStageSnapshot(competition: Competition, stage: IndividualStage, throughRound: number): IndividualStanding[] {
  const filtered: Competition = {
    ...competition,
    matches: competition.matches.filter((match) => match.stage !== stage || (match.round ?? 1) <= throughRound),
  };
  return individualStageStandings(filtered, stage);
}

/** 每个阶段已经打到的最大轮次，用于轮次快照选择器。 */
export function individualStageRounds(competition: Competition, stage: IndividualStage) {
  const rounds = new Set<number>();
  for (const table of competition.individualSchedule ?? []) if (table.stage === stage) rounds.add(table.round);
  for (const match of competition.matches) if (match.stage === stage) rounds.add(match.round ?? 1);
  return [...rounds].sort((left, right) => left - right);
}
