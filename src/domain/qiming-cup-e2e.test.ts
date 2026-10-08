import { describe, expect, it } from "vitest";
import { defaultIndividualPreliminary } from "./competition-format";
import {
  individualActiveStage,
  individualCurrentPoints,
  individualEliminatedPlayers,
  individualStageComplete,
  individualStageStandings,
  individualStageWeeks,
  individualWeekOf,
} from "./individual-standings";
import { opponentPairCounts, planIndividualWeek } from "./individual-schedule";
import {
  individualPendingSettlement,
  individualPreliminaryWeekCount,
  individualSettlementWeeks,
  individualTableTime,
  individualWeekSettlement,
  individualNegotiationOpensAt,
  individualNegotiationOpen,
  individualRoundsPerDay,
  planPreliminaryRegularWeeks,
  settlePreliminaryWeek,
} from "./individual-tournament";
import { completeScheduledMatch } from "./scheduled-match";
import type { Competition, IndividualCompetitionSettings, MatchRecord } from "./types";

/**
 * 启明杯全流程回归：开赛 → 4 个日常周 → 3 个淘汰周 → 决赛。
 * 覆盖「时间不倒挂」「积分连续」「淘汰名单正确」「排名口径」这几条最容易出事的主线。
 */
const START = "2026-10-11";
const settings: IndividualCompetitionSettings = {
  preliminary: { ...defaultIndividualPreliminary, startDate: START },
  final: { matchCountPerPlayer: 12 },
  pairingMode: "balanced_opponents",
};

const beijing = (iso: string) => new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

function build(): Competition {
  const participants = Array.from({ length: 16 }, (_, index) => ({
    id: `p${index + 1}`,
    personId: `person-${index + 1}`,
    displayName: `选手${index + 1}`,
    kind: "human" as const,
    color: "#168f83",
    usernames: [`user${index + 1}`],
  }));
  const competition: Competition = {
    id: "1st-qm", name: "第一届启明杯", code: "1ST-QM", format: "individual", status: "active",
    plannedMatchCount: 112, initialPoints: 25000, rankPoints: [30, 10, -10, -30],
    participants, matches: [], individualSettings: settings,
  };
  competition.individualSchedule = planPreliminaryRegularWeeks(competition, settings).tables;
  return competition;
}

/** 模拟管理员把某一周所有桌次的牌谱录完：顺位按参赛者序号给出确定结果。 */
function playWeek(competition: Competition, week: number) {
  const order = new Map(competition.participants.map((participant, index) => [participant.id, index]));
  const tables = (competition.individualSchedule ?? []).filter((table) => table.stage === "preliminary" && individualWeekOf(table) === week);
  for (const table of tables) {
    const match: MatchRecord = {
      id: `${table.id}-match`, matchNumber: competition.matches.length + 1,
      scheduleId: table.id, stage: "preliminary", week, round: table.round, tableNumber: table.tableNumber,
      status: "completed", playedAt: table.scheduledAt, tenhouLogId: `${table.id}-log`, tenhouUrl: "", nagaUrl: null, reviewNote: null,
      seats: table.participantIds.map((participantId, seat) => ({
        seat: seat as 0 | 1 | 2 | 3, participantId, sourceUsername: participantId,
        rawPoints: 25000, rank: (seat + 1) as 1 | 2 | 3 | 4,
        competitionPoints: 30 - seat * 20 - (order.get(participantId) ?? 0),
        assignmentSource: "manual" as const,
      })),
    };
    completeScheduledMatch(competition, match);
    competition.matches.push(match);
  }
}

describe("启明杯全流程", () => {
  it("开赛：一次排出 4 个日常周，时间不倒挂且都在周日/周三 20:00 与 21:00", () => {
    const competition = build();
    const tables = competition.individualSchedule!;
    expect(tables).toHaveLength(64);
    expect(individualStageWeeks(competition, "preliminary")).toEqual([1, 2, 3, 4]);
    const times = tables.map((table) => Date.parse(table.scheduledAt));
    // 同一轮的 4 张桌同时开赛，所以每周只有 4 个不同的开赛时间。
    expect(new Set(times).size).toBe(16);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const table of tables) {
      expect(beijing(table.scheduledAt)).toMatch(/20:00:00|21:00:00/);
      // Node 的 ICU 输出「星期日 / 星期三」，浏览器里是「周日 / 周三」，两种都接受。
      expect(["周日", "星期日", "周三", "星期三"]).toContain(new Date(table.scheduledAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" }));
    }
    for (const participant of competition.participants) {
      expect(tables.filter((table) => table.participantIds.includes(participant.id))).toHaveLength(16);
    }
    for (const week of [1, 2, 3, 4]) {
      expect(tables.filter((table) => individualWeekOf(table) === week)).toHaveLength(16);
    }
  });

  it("配桌：同桌四人互不重复，且跨 4 周尽量不重复遇到同一对手", () => {
    const competition = build();
    const seen = new Set<string>();
    for (const table of competition.individualSchedule!) {
      expect(new Set(table.participantIds).size).toBe(4);
      for (const id of table.participantIds) seen.add(id);
    }
    expect(seen.size).toBe(16);
    const counts = Object.values(opponentPairCounts(competition.individualSchedule!));
    // 16 人打 64 桌：每对平均相遇 3.2 次，均匀时是 3 或 4 次。
    expect(Math.max(...counts)).toBeLessThanOrEqual(5);
    expect(counts.filter((count) => count === 1 || count === 2).length).toBeLessThanOrEqual(12);
  });

  it("结算门禁：只有第 4 周和淘汰周需要结算，牌谱没录完不许结算", () => {
    const competition = build();
    for (const week of [4, 5, 6, 7].filter((value) => value <= individualPreliminaryWeekCount(settings))) {
      const settlement = individualWeekSettlement(competition, week);
      if (week <= 4) {
        expect(settlement).toBeTruthy();
        expect(settlement!.canSettle).toBe(false);
        expect(settlement!.reason).toContain("没有录入牌谱");
      }
    }
    expect(individualSettlementWeeks(settings)).toEqual([4, 5, 6, 7]);
    expect(individualPendingSettlement(competition)?.week).toBe(4);
    expect(() => settlePreliminaryWeek(competition, 4)).toThrow("没有录入牌谱");
    expect(individualWeekSettlement(competition, 1)).toBeNull();
    expect(individualWeekSettlement(competition, 3)).toBeNull();
  });

  it("跑完 7 周：16 → 12 → 8 → 4，积分只增不减、淘汰者冻结、决赛清零", () => {
    const competition = build();
    const expectedTables = [16, 16, 12, 8];

    // 真实流程：先把第 1–4 个日常周全部录完，才能结算第 4 周。
    for (const week of [1, 2, 3, 4]) playWeek(competition, week);
    for (const [index, week] of [4, 5, 6, 7].entries()) {
      if (week === 4) {
        // 第 4 周的结算状态在录完牌谱前后各看一眼。
        expect(individualWeekSettlement(competition, 4)!.complete).toBe(true);
      } else {
        playWeek(competition, week);
      }
      const settlement = individualWeekSettlement(competition, week)!;
      expect(settlement.complete).toBe(true);
      expect(settlement.canSettle).toBe(true);
      expect(settlement.tables).toBe(expectedTables[index]);
      expect(settlement.kind).toBe(week > 4 ? "elimination" : "regular");

      const leaving = new Set(settlement.leaving.map((item) => item.participantId));
      settlePreliminaryWeek(competition, week);
      // 初赛不清零：当前积分恒等于「本阶段对局分 + 手工加减分」。
      const rows = individualStageStandings(competition, "preliminary");
      for (const row of rows) expect(row.points).toBe(row.matchPoints + row.adjustmentPoints);
      // 打过的半庄数只增不减。
      expect(rows.reduce((sum, row) => sum + row.games, 0)).toBe(competition.matches.length * 4);
      if (week > 4) {
        expect(leaving.size).toBe(4);
        for (const id of leaving) expect(individualEliminatedPlayers(competition).has(id)).toBe(true);
      }
    }

    expect(individualEliminatedPlayers(competition).size).toBe(12);
    expect(individualActiveStage(competition)).toBe("final");
    expect(individualStageWeeks(competition, "final")).toEqual([1, 2, 3]);
 expect((competition.individualSchedule ?? []).filter((table) => table.stage === "final")).toHaveLength(12);
    expect(individualStageComplete(competition, "preliminary")).toBe(true);
    expect(individualPendingSettlement(competition)).toBeNull();
    // 决赛允许顺延（只有淘汰周限制）。
    expect((competition.individualSchedule ?? []).filter((table) => table.stage === "final").every((table) => !table.rules)).toBe(true);
    expect([...individualCurrentPoints(competition, "final").values()].every((points) => points === 0)).toBe(true);
    // 总桌数 64 + 16 + 12 + 8 + 12 = 112，与 plannedMatchCount 一致。
    expect(competition.individualSchedule).toHaveLength(competition.plannedMatchCount);
  });

  it("淘汰者名次垫底、被淘汰后不再涨分", () => {
    const competition = build();
    for (const week of [1, 2, 3, 4]) playWeek(competition, week);
    settlePreliminaryWeek(competition, 4);

    playWeek(competition, 5);
    const leaving = individualWeekSettlement(competition, 5)!.leaving.map((item) => item.participantId);
    expect(leaving).toHaveLength(4);
    settlePreliminaryWeek(competition, 5);

    const frozen = new Map(leaving.map((id) => [id, individualCurrentPoints(competition, "preliminary").get(id)!]));
    playWeek(competition, 6);
    settlePreliminaryWeek(competition, 6);

    // 被淘汰的人后面几周不再有桌次，积分冻结在淘汰那一刻。
    for (const id of leaving) expect(individualCurrentPoints(competition, "preliminary").get(id)).toBe(frozen.get(id));

    // 积分榜保留全部 16 人，被淘汰的标「淘汰」且排在存活者之后。
    const rows = individualStageStandings(competition, "preliminary");
    expect(rows).toHaveLength(16);
    const bestSurvivorRank = Math.min(...rows.filter((row) => !row.eliminated).map((row) => row.rank));
    for (const id of leaving) {
      const row = rows.find((item) => item.participant.id === id)!;
      expect(row.eliminated).toBe(true);
      expect(row.rank).toBeGreaterThan(bestSurvivorRank);
    }
  });

  it("时间轴：每周都晚于上一周，决赛排在初赛之后（本次修复的回归点）", () => {
    const competition = build();
    for (const week of [4, 5, 6, 7]) {
      playWeek(competition, week);
      settlePreliminaryWeek(competition, week);
    }
    const at = (stage: "preliminary" | "final", week: number) => competition.individualSchedule!
      .filter((table) => table.stage === stage && individualWeekOf(table) === week)
      .map((table) => Date.parse(table.scheduledAt));
    for (let week = 2; week <= 7; week += 1) {
      expect(Math.min(...at("preliminary", week))).toBeGreaterThan(Math.max(...at("preliminary", week - 1)));
    }
    // 决赛第 1 周必须晚于初赛最后一周，且等于开赛日之后第 8 个周日。
    expect(Math.min(...at("final", 1))).toBeGreaterThan(Math.max(...at("preliminary", 7)));
    expect(new Date(Math.min(...at("final", 1))).toISOString()).toBe(individualTableTime(START, 8, 1, settings));
    expect(beijing(individualTableTime(START, 8, 1, settings))).toContain("2026/11/29");
    for (let week = 2; week <= 3; week += 1) {
      expect(Math.min(...at("final", week))).toBeGreaterThan(Math.max(...at("final", week - 1)));
    }
  });

  it("积分榜：积分降序、同分再比平均顺位，加减分计入本阶段", () => {
    const competition = build();
    for (const week of [4, 5, 6, 7]) {
      playWeek(competition, week);
      settlePreliminaryWeek(competition, week);
    }
    const rows = individualStageStandings(competition, "preliminary");
    expect(rows).toHaveLength(16);
    expect(rows.map((row) => row.rank)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index - 1].points).toBeGreaterThanOrEqual(rows[index].points);
      // 同分时平均顺位不能倒挂。
      if (rows[index - 1].points === rows[index].points) {
        expect(rows[index - 1].averageRank ?? Infinity).toBeLessThanOrEqual(rows[index].averageRank ?? Infinity);
      }
    }
    expect(rows.filter((row) => row.eliminated)).toHaveLength(12);

    competition.individualAdjustments = [{ id: "adj-1", stage: "preliminary", participantId: "p1", points: -50, reason: "迟到", at: new Date().toISOString() }];
    const adjusted = individualStageStandings(competition, "preliminary").find((row) => row.participant.id === "p1")!;
    expect(adjusted.adjustmentPoints).toBe(-50);
    expect(adjusted.points).toBe(adjusted.matchPoints - 50);
    // 初赛加减分不带进决赛；决赛自己的加减分才计入。
    expect(individualCurrentPoints(competition, "final").get("p1")).toBe(0);
    competition.individualAdjustments.push({ id: "adj-2", stage: "final", participantId: "p1", points: 5, reason: "决赛迟到", at: new Date().toISOString() });
    expect(individualCurrentPoints(competition, "final").get("p1")).toBe(5);
  });

  it("重复结算与非法结算都被挡住", () => {
    const competition = build();
    playWeek(competition, 4);
    settlePreliminaryWeek(competition, 4);
    expect(() => settlePreliminaryWeek(competition, 4)).toThrow("已经结算过");
    expect(() => settlePreliminaryWeek(competition, 3)).toThrow("还没有排好");
    expect(() => settlePreliminaryWeek(competition, 5)).toThrow("没有录入牌谱");
  });

  it("协商时间窗：两个窗口都挂在上一周的晚上 22:00", () => {
    const beijing = (iso: string) => new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    expect(individualRoundsPerDay(settings)).toBe(2);

    // 第 2 周周三 10/21 的两轮：上一周周日 10/11 22:00 开放。
    expect(beijing(individualNegotiationOpensAt({ week: 2, round: 3 }, settings)!)).toContain("2026/10/11 22:00:00");
    expect(beijing(individualNegotiationOpensAt({ week: 2, round: 4 }, settings)!)).toContain("2026/10/11 22:00:00");

    // 第 2 周周日 10/18 的两轮：上一周周三 10/14 22:00 开放（不是本周周三，否则开成赛后）。
    expect(beijing(individualNegotiationOpensAt({ week: 2, round: 1 }, settings)!)).toContain("2026/10/14 22:00:00");
    expect(beijing(individualNegotiationOpensAt({ week: 2, round: 2 }, settings)!)).toContain("2026/10/14 22:00:00");

    // 第 3 周顺延：周三等 10/18 22:00，周日等 10/21 22:00。
    expect(beijing(individualNegotiationOpensAt({ week: 3, round: 3 }, settings)!)).toContain("2026/10/18 22:00:00");
    expect(beijing(individualNegotiationOpensAt({ week: 3, round: 1 }, settings)!)).toContain("2026/10/21 22:00:00");

    // 第一周没有上一周可依，从首场前一周就开放（首场 10/11，两场都能提前确认）。
    expect(beijing(individualNegotiationOpensAt({ week: 1, round: 1 }, settings)!)).toContain("2026/10/4 00:00:00");
    expect(beijing(individualNegotiationOpensAt({ week: 1, round: 3 }, settings)!)).toContain("2026/10/4 00:00:00");
  });

  it("协商时间窗永远早于比赛本身，且同一天两轮同时开放", () => {
    for (let week = 1; week <= 7; week += 1) {
      for (const round of [1, 2, 3, 4]) {
        const opensAt = Date.parse(individualNegotiationOpensAt({ week, round }, settings)!);
        const playsAt = Date.parse(individualTableTime(START, week, round, settings));
        expect(opensAt).toBeLessThan(playsAt);
        // 最早的一档是第一周的 188 小时，也保证不会当天才开。
        expect(playsAt - opensAt).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
      }
      // 同一天的两轮必须同一时刻开放，否则又会出现「第一轮能确认、第二轮不能」。
      expect(individualNegotiationOpensAt({ week, round: 1 }, settings))
        .toBe(individualNegotiationOpensAt({ week, round: 2 }, settings));
      expect(individualNegotiationOpensAt({ week, round: 3 }, settings))
        .toBe(individualNegotiationOpensAt({ week, round: 4 }, settings));
    }
  });

  it("每天第二场是 21:00（不是 21:30）", () => {
    expect(individualTableTime(START, 1, 1, settings)).toBe("2026-10-11T12:00:00.000Z");
    expect(individualTableTime(START, 1, 2, settings)).toBe("2026-10-11T13:00:00.000Z");
    expect(individualTableTime(START, 1, 3, settings)).toBe("2026-10-14T12:00:00.000Z");
    expect(individualTableTime(START, 1, 4, settings)).toBe("2026-10-14T13:00:00.000Z");
  });

  it("开放判断按当前时间推进", () => {
    const at = (iso: string) => Date.parse(iso);
    // 第 2 周周三那场：10/11 22:00 之前还锁着，之后开。
    expect(individualNegotiationOpen({ week: 2, round: 3 }, settings, at("2026-10-11T21:59:00+08:00"))).toBe(false);
    expect(individualNegotiationOpen({ week: 2, round: 3 }, settings, at("2026-10-11T22:00:00+08:00"))).toBe(true);
    // 第 2 周周日那场：10/14 22:00 之前还锁着，之后开。
    expect(individualNegotiationOpen({ week: 2, round: 1 }, settings, at("2026-10-14T21:59:00+08:00"))).toBe(false);
    expect(individualNegotiationOpen({ week: 2, round: 1 }, settings, at("2026-10-14T22:00:00+08:00"))).toBe(true);
  });

  it("人数不是 4 的倍数时报错，不虚构第四名选手", () => {
    const competition = build();
    const ids = competition.participants.map((participant) => participant.id);
    expect(() => planIndividualWeek(["p1", "p2", "p3"], "preliminary", 1, 4)).toThrow("至少需要 4 名选手");
    const plan = planIndividualWeek(ids, "preliminary", 1, 4, { allowUnevenGames: true });
    expect(plan.tables).toHaveLength(16);
    expect(plan.byes).toHaveLength(0);
  });
});
