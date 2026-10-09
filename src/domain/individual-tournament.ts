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
const HOUR_MS = 60 * 60 * 1000;
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

/** 每天打几轮（每周 4 半庄 = 每天 2 轮）。同一天对手固定，赛前一起确认完。 */
export function individualRoundsPerDay(settings: IndividualCompetitionSettings) {
  const matchesPerWeek = Math.max(1, settings.preliminary.matchesPerPlayerPerWeek);
  return Math.max(1, Math.ceil(matchesPerWeek / 2));
}

/**
 * 这一桌什么时候才开放协商：
 * - 周三那两轮（第 3、4 轮）：同周周一 00:00（北京时间）起；
 * - 周日那两轮（第 1、2 轮）：上一周周三那场打完之后起，也就是上一周的周四 00:00；
 *   第一周的周日没有上一周可比，开赛前就开放。
 *
 * 这里是「协商这一场」，所以窗口永远开在比赛时间之前，不会出现
 * 「周三都打完了才开放协商周三」的矛盾。
 */
/** 协商窗口的开放时刻（北京时间当天 22:00，当天两轮一起开放）。 */
const NEGOTIATION_OPEN_HOUR = 22;

export function individualNegotiationOpensAt(table: { week?: number; round: number }, settings: IndividualCompetitionSettings) {
  const week = individualWeekOf(table);
  const sunday = individualWeekDays(individualStartDate(settings), week)[0];
  if (!Number.isFinite(sunday)) return null;
  const beijingMidnight = BEIJING_OFFSET_MINUTES * 60 * 1000;
  const isWednesdayBatch = table.round > individualRoundsPerDay(settings);
  // sunday 对应北京时间「本周周日 08:00」，减 8 小时才是北京 00:00。
  const at22 = (dayBase: number) => dayBase - beijingMidnight + NEGOTIATION_OPEN_HOUR * HOUR_MS;
  // 周三那两轮：等它前面那个周日（就是本周的周日）22:00。
  if (isWednesdayBatch) return new Date(at22(sunday)).toISOString();
  // 周日那两轮：等上一周的周三 22:00——本周的周三在周日之后，用它会开成赛后。
  if (week <= 1) {
    // 第一周的周日没有「上一周周三」可依，只能从现在起就开放，
    // 否则首场没人来得及确认。
    return new Date(sunday - 7 * DAY_MS - beijingMidnight).toISOString();
  }
  return new Date(at22(sunday - 4 * DAY_MS)).toISOString();
}



/** 现在能不能协商这一桌。 */
export function individualNegotiationOpen(table: { week?: number; round: number }, settings: IndividualCompetitionSettings, now = Date.now()) {
  const opensAt = individualNegotiationOpensAt(table, settings);
  return opensAt === null || Date.parse(opensAt) <= now;
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
  // 决赛的周次从 1 重新计数（individualStageWeeks 与界面都按阶段内周次显示），
  // 但日期必须接在初赛全部周次之后，否则决赛会被算回开赛日附近，和初赛重叠。
  const weekOffset = stage === "final" ? individualPreliminaryWeekCount(settings) : 0;
  return {
    tables: plan.tables.map((table) => ({
      ...table,
      id: `${competition.id}-${stage}-w${table.week}-r${table.round}-t${table.tableNumber}`,
      scheduledAt: individualTableTime(startDate, (table.week ?? 1) + weekOffset, table.round, settings),
      timezone: "Asia/Shanghai",
      status: "scheduled" as const,
      // 淘汰周只允许提前、不允许顺延。
      ...(elimination ? { rules: { onlyEarlier: true, noPostpone: true } } : {}),
    })),
    byes: plan.byes,
  };
}

/** 排出第 N 周（初赛）的桌次：剩余选手、随机配桌、尽量不重复对手。 */
export function planPreliminaryWeek(competition: Competition, week: number, settings: IndividualCompetitionSettings, seedSalt = 0) {
  const participantIds = individualSurvivors(competition).map((participant) => participant.id);
  const priorPairs = opponentPairCounts(competition.individualSchedule ?? []);
  const plan = planIndividualWeek(participantIds, "preliminary", week, settings.preliminary.matchesPerPlayerPerWeek, {
    allowUnevenGames: true,
    seed: stableSeed(`${competition.id}-preliminary-${week}-${seedSalt}`),
    priorPairs,
    // 同一天的两轮同桌固定：按天分组，一个分组连打两天里的几场。
    roundsPerDay: individualRoundsPerDay(settings),
  });
  return materializeTables(competition, plan, "preliminary", settings);
}

/** 对手相遇次数的均衡度打分：次数上限越低、偏离均值越小越好。 */
export function opponentBalanceScore(tables: Array<{ participantIds: string[] }>) {
  const counts = new Map<string, number>();
  for (const table of tables) {
    const ids = [...table.participantIds].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const values = [...counts.values()];
  if (!values.length) return { max: 0, spread: 0, pairs: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return { max: Math.max(...values), spread, pairs: counts.size };
}

/** 开赛时一次排完日常周（第 1 周 – 第 regularWeeks 周）的全部桌次。 */
export function planPreliminaryRegularWeeks(competition: Competition, settings: IndividualCompetitionSettings, seedAttempts = 240) {
  const weeks = Math.max(0, settings.preliminary.regularWeeks);
  if (!weeks) return { tables: [], byes: [] };

  const build = (seedSalt: number) => {
    const tables: IndividualScheduleTable[] = [];
    const byes: IndividualStageBye[] = [];
    for (let week = 1; week <= weeks; week += 1) {
      const draft: Competition = { ...competition, individualSchedule: [...(competition.individualSchedule ?? []), ...tables] };
      const plan = planPreliminaryWeek(draft, week, settings, seedSalt);
      tables.push(...plan.tables);
      byes.push(...plan.byes);
    }
    return { tables, byes };
  };

  // 随机分桌 + 择优：跑多组种子，挑「对手遇见次数上限最低、整体最均匀」的那套。
  // 仍然随机（种子固定可复现），但不会给出个别对子被反复撞上的排法。
  // 同一天同桌固定，所以相遇次数一定是 roundsPerDay 的整数倍；
  // 平均值向上取到下一个倍数就是能达到的理论上限，达到即可停止搜索。
  const rosterSize = competition.participants.length;
  // 一张四人桌产生 6 对相遇，所以总相遇次数 = 座位数 × 3 / 2。
  const totalSeats = weeks * rosterSize * settings.preliminary.matchesPerPlayerPerWeek;
  const possiblePairs = rosterSize * (rosterSize - 1) / 2;
  const meanPerPair = possiblePairs > 0 ? (totalSeats * 3) / 2 / possiblePairs : 0;
  const step = individualRoundsPerDay(settings);
  const idealMax = Math.ceil(meanPerPair / step) * step;

  let best: ReturnType<typeof build> | null = null;
  let bestScore = { max: Number.POSITIVE_INFINITY, spread: Number.POSITIVE_INFINITY };
  for (let attempt = 0; attempt < Math.max(1, seedAttempts); attempt += 1) {
    const candidate = build(attempt);
    const score = opponentBalanceScore(candidate.tables);
    // 先比「最多遇上几次」，一样再看整体偏离均值的程度。
    const better = score.max < bestScore.max
      || (score.max === bestScore.max && score.spread < bestScore.spread);
    if (better) { bestScore = score; best = candidate; }
    if (bestScore.max <= idealMax) break;
  }
  return best!;
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
      roundsPerDay: individualRoundsPerDay(settings),
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
