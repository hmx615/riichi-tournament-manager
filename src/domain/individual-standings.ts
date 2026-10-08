import type { Competition, IndividualStage, MatchRecord, Participant } from "./types";
import { scheduledMatch } from "./scheduled-match";

export type IndividualStanding = {
  participant: Participant;
  /** 阶段积分：阶段内所有对局累计 + 手工加减分（初赛不因周次清零，决赛从零开始）。 */
  points: number;
  /** 阶段内对局拿到的分数（不含手工加减分）。 */
  matchPoints: number;
  /** 该阶段的手工加减分合计。 */
  adjustmentPoints: number;
  games: number;
  averageRank: number | null;
  /** 本阶段一位次数、二位次数，用于同分破平。 */
  firstPlaceCount: number;
  secondPlaceCount: number;
  rank: number;
  /** 已经在本阶段被淘汰（淘汰周结算落库）。 */
  eliminated: boolean;
};

/**
 * 同分破平口径：积分 → 平均顺位 → 一位次数 → 二位次数 → 姓名。
 * 淘汰线上先比平均顺位，是主办确认过的口径。
 */
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

/** 桌次/对局属于第几周：老数据没有 week 字段时按第 1 周处理。 */
export function individualWeekOf(record: { week?: number }) {
  return Number.isInteger(record.week) && (record.week as number) > 0 ? record.week as number : 1;
}

function completedMatches(competition: Competition, stage: IndividualStage, throughWeek?: number): MatchRecord[] {
  return competition.matches.filter((match) => match.status === "completed" && match.stage === stage
    && (throughWeek === undefined || individualWeekOf(match) <= throughWeek));
}

export function individualStageRawPoints(competition: Competition, stage: IndividualStage, throughWeek?: number) {
  const points = new Map<string, number>();
  for (const match of completedMatches(competition, stage, throughWeek)) {
    for (const seat of match.seats) points.set(seat.participantId, (points.get(seat.participantId) ?? 0) + seat.competitionPoints);
  }
  return points;
}

/** 手工加减分（迟到扣分等）：只计入所在阶段，不随后续周次清零。 */
export function individualAdjustmentPoints(competition: Competition, stage: IndividualStage) {
  const points = new Map<string, number>();
  for (const item of competition.individualAdjustments ?? []) {
    if (item.stage !== stage) continue;
    points.set(item.participantId, (points.get(item.participantId) ?? 0) + item.points);
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
 * 当前积分：初赛是初赛全部对局累计（日常周与淘汰周都不清零），进决赛从零重新计。
 * 被淘汰的选手不再有后续对局，积分自然冻结在淘汰那一刻。
 */
export function individualCurrentPoints(competition: Competition, stage: IndividualStage, throughWeek?: number) {
  const matchPoints = individualStageRawPoints(competition, stage, throughWeek);
  const adjustmentPoints = individualAdjustmentPoints(competition, stage);
  const totals = new Map<string, number>();
  for (const id of individualStageParticipants(competition, stage)) {
    totals.set(id, (matchPoints.get(id) ?? 0) + (adjustmentPoints.get(id) ?? 0));
  }
  return totals;
}

/** 已淘汰选手 → 第几周被淘汰。 */
export function individualEliminatedPlayers(competition: Competition) {
  const eliminated = new Map<string, number>();
  for (const record of competition.individualEliminations ?? []) {
    for (const id of record.participantIds) eliminated.set(id, record.week);
  }
  return eliminated;
}

/** 当前进行到的阶段：已经排出决赛赛程就进入决赛。 */
export function individualActiveStage(competition: Competition): IndividualStage {
  const enteredFinal = (competition.individualSchedule ?? []).some((table) => table.stage === "final")
    || competition.matches.some((match) => match.stage === "final");
  return enteredFinal ? "final" : "preliminary";
}

/** 某个阶段是否已经打完：该阶段桌次全部完成。 */
export function individualStageComplete(competition: Competition, stage: IndividualStage) {
  const tables = (competition.individualSchedule ?? []).filter((table) => table.stage === stage && table.status !== "cancelled");
  return tables.length > 0 && tables.every((table) => table.status === "completed" || Boolean(scheduledMatch(competition, table)));
}

export function individualStageStandings(competition: Competition, stage: IndividualStage, throughWeek?: number): IndividualStanding[] {
  const eliminated = individualEliminatedPlayers(competition);
  const totals = individualCurrentPoints(competition, stage, throughWeek);
  const matchPointsByPlayer = individualStageRawPoints(competition, stage, throughWeek);
  const adjustments = individualAdjustmentPoints(competition, stage);
  const entered = individualStageParticipants(competition, stage);
  const matches = completedMatches(competition, stage, throughWeek);
  const rows = competition.participants.filter((participant) => entered.has(participant.id)).map((participant) => {
    const seats = matches.flatMap((match) => match.seats.filter((seat) => seat.participantId === participant.id));
    const rankTotal = seats.reduce((sum, seat) => sum + seat.rank, 0);
    return {
      participant,
      points: totals.get(participant.id) ?? 0,
      matchPoints: matchPointsByPlayer.get(participant.id) ?? 0,
      adjustmentPoints: adjustments.get(participant.id) ?? 0,
      games: seats.length,
      averageRank: seats.length ? rankTotal / seats.length : null,
      firstPlaceCount: seats.filter((seat) => seat.rank === 1).length,
      secondPlaceCount: seats.filter((seat) => seat.rank === 2).length,
      eliminated: eliminated.has(participant.id),
    };
  }).sort((left, right) => compareIndividualTiebreak(
    { ...left, displayName: left.participant.displayName },
    { ...right, displayName: right.participant.displayName },
  ));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

/** 只统计到某一周为止的对局，得到该周结束时的阶段积分榜快照。 */
export function individualStageSnapshot(competition: Competition, stage: IndividualStage, throughWeek: number) {
  return individualStageStandings(competition, stage, throughWeek);
}

/** 某个阶段已经排到 / 打到第几周，用于按周查看。 */
export function individualStageWeeks(competition: Competition, stage: IndividualStage) {
  const weeks = new Set<number>();
  for (const table of competition.individualSchedule ?? []) if (table.stage === stage) weeks.add(individualWeekOf(table));
  for (const match of competition.matches) if (match.stage === stage) weeks.add(individualWeekOf(match));
  return [...weeks].sort((left, right) => left - right);
}

/** 某一周的桌次。 */
export function individualWeekTables(competition: Competition, stage: IndividualStage, week: number) {
  return (competition.individualSchedule ?? []).filter((table) => table.stage === stage && individualWeekOf(table) === week);
}

/** 某一周是否全部打完：该周桌次都有牌谱。 */
export function individualWeekComplete(competition: Competition, stage: IndividualStage, week: number) {
  const tables = individualWeekTables(competition, stage, week).filter((table) => table.status !== "cancelled");
  return tables.length > 0 && tables.every((table) => table.status === "completed" || Boolean(scheduledMatch(competition, table)));
}
