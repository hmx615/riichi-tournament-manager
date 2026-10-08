import { individualSettingsFor } from "./competition-format";
import type { IndividualCompetitionSettings, IndividualPreliminarySettings, IndividualScheduleTable } from "./types";
import type { Competition, IndividualStage, IndividualStageBye } from "./types";
import { opponentPairCounts, planIndividualWeek, type ScheduledTable } from "./individual-schedule";
import {
  individualEliminatedPlayers,
  individualStageStandings,
  individualWeekOf,
  individualWeekComplete,
  individualWeekTables,
} from "./individual-standings";

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MINUTES = 8 * 60;

/** 第一周的第一个比赛日；没配置时退回今天，保证排期不会算出非法时间。 */
export function individualStartDate(settings: IndividualCompetitionSettings) {
  const configured = settings.preliminary.startDate;
  return configured && Number.isFinite(Date.parse(`${configured}T00:00:00Z`)) ? configured : new Date().toISOString().slice(0, 10);
}

/** 初赛总周数（日常周 + 淘汰周）。 */
export function individualPreliminaryWeekCount(settings: IndividualCompetitionSettings) {
  return settings.preliminary.regularWeeks + settings.preliminary.eliminationWeeks;
}

/**
 * 初赛需要管理员结算的周：日常周的**最后一周**（打完结账、生成淘汰周）
 * 以及每一个淘汰周（结算淘汰名单并生成下一周，最后一个淘汰周生成决赛）。
 */
export function individualSettlementWeeks(settings: IndividualCompetitionSettings) {
  const weeks: number[] = [];
  for (let week = settings.preliminary.regularWeeks; week <= individualPreliminaryWeekCount(settings); week += 1) weeks.push(week);
  return weeks;
}

/** 第 N 周的两个法定比赛日（周日与周三）的 UTC 零点。 */
export function individualWeekDays(startDate: string, week: number) {
  const base = Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(base)) return [];
  const sunday = base + (week - 1) * 7 * DAY_MS;
  return [sunday, sunday + 3 * DAY_MS];
}

/**
 * 某一轮的开赛时间：每周两个比赛日，每天打 ceil(每周半庄 / 2) 轮，
 * 默认周日 20:00 / 21:30，周三 20:00 / 21:30（北京时间）。
 */
export function individualTableTime(startDate: string, week: number, round: number, settings: IndividualCompetitionSettings) {
  const times = settings.preliminary.legalTimes ?? ["20:00", "21:30"];
  const matchesPerWeek = Math.max(1, settings.preliminary.matchesPerPlayerPerWeek);
  const roundsPerDay = Math.max(1, Math.ceil(matchesPerWeek / 2));
  const slot = (round - 1) % roundsPerDay;
  const dayIndex = Math.min(1, Math.floor((round - 1) / roundsPerDay));
  const days = individualWeekDays(startDate, week);
  const day = days[dayIndex] ?? days[0] ?? Date.parse(`${startDate}T00:00:00Z`);
  const [hour, minute] = (times[slot] ?? times[times.length - 1] ?? "20:00").split(":").map(Number);
  // 多个比赛日时，最后一个时段之后再排的轮次每次顺延 90 分钟。
  const laterSlots = Math.max(0, slot - (times.length - 1));
  const minutes = (hour || 0) * 60 + (minute || 0) - BEIJING_OFFSET_MINUTES + laterSlots * 90;
  return new Date(day + minutes * 60 * 1000).toISOString();
}

function stableSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 还没被淘汰的选手（按报名顺序）。 */
export function individualSurvivors(competition: Competition) {
  const eliminated = individualEliminatedPlayers(competition);
  return competition.participants.filter((participant) => !eliminated.has(participant.id));
}

function materializeTables(
  competition: Competition,
  plan: { tables: ScheduledTable[]; byes: IndividualStageBye[] },
  stage: IndividualStage,
  settings: IndividualCompetitionSettings,
): { tables: IndividualScheduleTable[]; byes: IndividualStageBye[] } {
  const startDate = individualStartDate(settings);
  const elimination = stage === "preliminary" && (plan.tables[0]?.week ?? 1) > settings.preliminary.regularWeeks;
  return {
    tables: plan.tables.map((table) => ({
      ...table,
      id: `${competition.id}-${stage}-w${table.week}-r${table.round}-t${table.tableNumber}`,
      scheduledAt: individualTableTime(startDate, table.week ?? 1, table.round, settings),
      timezone: "Asia/Shanghai",
      status: "scheduled" as const,
      // 淘汰周只允许提前、不允许顺延。
      ...(elimination ? { rules: { onlyEarlier: true, noPostpone: true } } : {}),
    })),
    byes: plan.byes,
  };
}

/** 排出第 N 周（初赛）的桌次：剩余选手、随机配桌、尽量不重复对手。 */
export function planPreliminaryWeek(competition: Competition, week: number, settings: IndividualCompetitionSettings) {
  const participantIds = individualSurvivors(competition).map((participant) => participant.id);
  const priorPairs = opponentPairCounts(competition.individualSchedule ?? []);
  const plan = planIndividualWeek(participantIds, "preliminary", week, settings.preliminary.matchesPerPlayerPerWeek, {
    allowUnevenGames: true,
    seed: stableSeed(`${competition.id}-preliminary-${week}`),
    priorPairs,
  });
  return materializeTables(competition, plan, "preliminary", settings);
}

/** 开赛时一次排完日常周（第 1 周 – 第 regularWeeks 周）的全部桌次。 */
export function planPreliminaryRegularWeeks(competition: Competition, settings: IndividualCompetitionSettings) {
  const tables: IndividualScheduleTable[] = [];
  const byes: IndividualStageBye[] = [];
  for (let week = 1; week <= Math.max(0, settings.preliminary.regularWeeks); week += 1) {
    const draft: Competition = { ...competition, individualSchedule: [...(competition.individualSchedule ?? []), ...tables] };
    const plan = planPreliminaryWeek(draft, week, settings);
    tables.push(...plan.tables);
    byes.push(...plan.byes);
  }
  return { tables, byes };
}

/** 排出决赛（剩 finalistCount 人，12 个半庄分成几周一次排完）。 */
export function planFinal(competition: Competition, settings: IndividualCompetitionSettings) {
  const participantIds = individualSurvivors(competition).map((participant) => participant.id);
  const games = settings.final.matchCountPerPlayer;
  const perWeek = Math.max(1, settings.preliminary.matchesPerPlayerPerWeek);
  const weeks = Math.max(1, Math.ceil(games / perWeek));
  const tables: ScheduledTable[] = [];
  const byes: IndividualStageBye[] = [];
  let priorPairs = opponentPairCounts(competition.individualSchedule ?? []);
  let remaining = games;
  for (let week = 1; week <= weeks; week += 1) {
    const gamesThisWeek = Math.min(perWeek, remaining);
    remaining -= gamesThisWeek;
    const plan = planIndividualWeek(participantIds, "final", week, gamesThisWeek, {
      allowUnevenGames: true,
      seed: stableSeed(`${competition.id}-final-${week}`),
      priorPairs,
    });
    tables.push(...plan.tables);
    byes.push(...plan.byes);
    priorPairs = opponentPairCounts([...tables]);
  }
  return materializeTables(competition, { tables, byes }, "final", settings);
}

export type IndividualEliminationCandidate = {
  participantId: string;
  displayName: string;
  points: number;
  averageRank: number | null;
};

export type IndividualWeekSettlement = {
  week: number;
  stage: IndividualStage;
  /** 日常周的最后一周只结账不淘汰；淘汰周结账并淘汰末位选手。 */
  kind: "regular" | "elimination";
  tables: number;
  recorded: number;
  complete: boolean;
  /** 已经结算过（下一周赛程已经生成）。 */
  settled: boolean;
  canSettle: boolean;
  /** 不能结算时的原因。 */
  reason: string;
  /** 结算后将被淘汰的选手（按积分倒序取末位）。 */
  leaving: IndividualEliminationCandidate[];
  /** 结算后的存活人数。 */
  remainingCount: number;
  /** 结算会生成什么：下一周赛程 / 决赛 / 全部结束。 */
  next: "week" | "final" | "done";
};

function settlementIsDone(competition: Competition, settings: IndividualCompetitionSettings, week: number) {
  const lastWeek = individualPreliminaryWeekCount(settings);
  if ((competition.individualSchedule ?? []).some((table) => table.stage === "final")) return true;
  if (week >= lastWeek) return false;
  return (competition.individualSchedule ?? []).some((table) => table.stage === "preliminary" && individualWeekOf(table) === week + 1);
}

function projectedElimination(competition: Competition, week: number, settings: IndividualCompetitionSettings) {
  const count = settings.preliminary.eliminationCountPerWeek;
  if (count <= 0) return [];
  // 只在本周实际参赛的人里排名，避免把之前已经淘汰的人再算一次。
  const playing = new Set(individualWeekTables(competition, "preliminary", week).flatMap((table) => table.participantIds));
  const rows = individualStageStandings(competition, "preliminary", week).filter((row) => playing.has(row.participant.id));
  const finalistCount = Math.max(1, settings.preliminary.finalistCount);
  const maximum = Math.max(0, rows.length - finalistCount);
  return rows.slice(rows.length - Math.min(count, maximum)).map((row) => ({
    participantId: row.participant.id,
    displayName: row.participant.displayName,
    points: row.points,
    averageRank: row.averageRank,
  }));
}

/** 某一周的结算状态与结算预览。 */
export function individualWeekSettlement(competition: Competition, week: number): IndividualWeekSettlement | null {
  const settings = individualSettingsFor(competition);
  if (!settings) return null;
  // 只有日常周的最后一周与各淘汰周需要管理员结算，其余周次没有结算环节。
  if (!individualSettlementWeeks(settings).includes(week)) return null;
  const lastWeek = individualPreliminaryWeekCount(settings);
  const kind: "regular" | "elimination" = week > settings.preliminary.regularWeeks ? "elimination" : "regular";
  const tables = individualWeekTables(competition, "preliminary", week);
  if (!tables.length) return null;
  const recorded = tables.filter((table) => table.status === "completed").length;
  const complete = individualWeekComplete(competition, "preliminary", week);
  const settled = settlementIsDone(competition, settings, week);
  const leaving = kind === "elimination" ? projectedElimination(competition, week, settings) : [];
  const remainingCount = individualSurvivors(competition).length - leaving.length;
  const next: IndividualWeekSettlement["next"] = week >= lastWeek ? "final" : "week";
  let reason = "";
  if (settled) reason = next === "final" ? "决赛赛程已经生成" : "下一周赛程已经生成";
  else if (!complete) reason = `本周还有 ${tables.length - recorded} 桌没有录入牌谱`;
  else if (kind === "elimination" && !leaving.length) reason = "没有可淘汰的选手，请检查设置";
  return { week, stage: "preliminary", kind, tables: tables.length, recorded, complete, settled, canSettle: !settled && complete && (kind === "regular" || leaving.length > 0), reason, leaving, remainingCount, next };
}

/** 当前需要管理员操作的那一周（最早一个还没生成下一周赛程的结算周）。 */
export function individualPendingSettlement(competition: Competition) {
  const settings = individualSettingsFor(competition);
  if (!settings) return null;
  for (const week of individualSettlementWeeks(settings)) {
    const settlement = individualWeekSettlement(competition, week);
    if (!settlement) continue;
    if (!settlement.settled) return settlement;
  }
  return null;
}

/** 结算某一周：生成下一周（或决赛）的桌次；淘汰周同时给出淘汰名单。 */
export function settlePreliminaryWeek(competition: Competition, week: number) {
  const settings = individualSettingsFor(competition);
  if (!settings) throw new Error("不是个人赛");
  const settlement = individualWeekSettlement(competition, week);
  if (!settlement) throw new Error("这一周还没有排好的赛程");
  if (settlement.settled) throw new Error("这一周已经结算过了");
  if (!settlement.complete) throw new Error(`第 ${week} 周还有 ${settlement.tables - settlement.recorded} 桌没有录入牌谱，不能结算`);
  const at = new Date().toISOString();
  if (settlement.kind === "elimination") {
    if (!settlement.leaving.length) throw new Error("没有可淘汰的选手，请检查比赛设置");
    const points: Record<string, number> = {};
    for (const item of settlement.leaving) points[item.participantId] = item.points;
    competition.individualEliminations = [...(competition.individualEliminations ?? []), {
      stage: "preliminary",
      week,
      participantIds: settlement.leaving.map((item) => item.participantId),
      points,
      at,
    }];
  }
  const plan = settlement.next === "final" ? planFinal(competition, settings) : planPreliminaryWeek(competition, week + 1, settings);
  competition.individualSchedule = [...(competition.individualSchedule ?? []), ...plan.tables];
  if (plan.byes.length) competition.individualByes = [...(competition.individualByes ?? []), ...plan.byes];
  return { settlement, generated: plan.tables };
}
