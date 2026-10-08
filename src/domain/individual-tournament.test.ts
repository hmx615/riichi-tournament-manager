import { describe, expect, it } from "vitest";
import { defaultIndividualCompetitionSettings } from "./competition-format";
import { individualCurrentPoints, individualEliminatedPlayers, individualStageWeeks, individualWeekOf } from "./individual-standings";
import {
  individualPendingSettlement,
  individualTableTime,
  individualWeekSettlement,
  planPreliminaryRegularWeeks,
  settlePreliminaryWeek,
} from "./individual-tournament";
import type { Competition, IndividualCompetitionSettings, MatchRecord } from "./types";

const settings: IndividualCompetitionSettings = { ...defaultIndividualCompetitionSettings, preliminary: { ...defaultIndividualCompetitionSettings.preliminary, startDate: "2026-10-11" } };

function buildCompetition(participantCount = 16): Competition {
  const participants = Array.from({ length: participantCount }, (_, index) => ({
    id: `p${index + 1}`,
    personId: `p${index + 1}`,
    displayName: `选手${index + 1}`,
    kind: "human" as const,
    color: "#168f83",
    usernames: [`user${index + 1}`],
  }));
  const competition: Competition = {
    id: "qm-cup",
    name: "第一届启明杯",
    code: "QM-CUP",
    format: "individual",
    status: "active",
    plannedMatchCount: 112,
    initialPoints: 25000,
    rankPoints: [30, 15, -15, -30],
    participants,
    matches: [],
    individualSettings: settings,
  };
  const regular = planPreliminaryRegularWeeks(competition, settings);
  competition.individualSchedule = regular.tables;
  return competition;
}

/** 给某一周补上全部已录入的牌谱：名次越靠前的选手总分越高，方便断言淘汰名单。 */
function playWeek(competition: Competition, week: number) {
  const order = new Map(competition.participants.map((participant, index) => [participant.id, index]));
  const tables = (competition.individualSchedule ?? []).filter((table) => table.stage === "preliminary" && individualWeekOf(table) === week);
  for (const table of tables) {
    const match: MatchRecord = {
      id: `${table.id}-match`,
      matchNumber: competition.matches.length + 1,
      scheduleId: table.id,
      stage: "preliminary",
      week,
      round: table.round,
      tableNumber: table.tableNumber,
      status: "completed",
      playedAt: "2026-10-11T12:00:00.000Z",
      tenhouLogId: `${table.id}-log`,
      tenhouUrl: "",
      nagaUrl: null,
      reviewNote: null,
      seats: table.participantIds.map((participantId, seat) => {
        const order0 = order.get(participantId) ?? 0;
        return {
          seat: seat as 0 | 1 | 2 | 3,
          participantId,
          sourceUsername: "",
          rawPoints: 25000,
          rank: (seat + 1) as 1 | 2 | 3 | 4,
          competitionPoints: 1000 - order0 * 10 - seat,
          assignmentSource: "manual" as const,
        };
      }),
    };
    competition.matches.push(match);
    table.status = "completed";
    table.matchNumber = match.matchNumber;
  }
}

describe("启明杯赛制排期", () => {
  it("schedules the four regular weeks up front for all 16 players", () => {
    const competition = buildCompetition();
    const tables = competition.individualSchedule ?? [];
    expect(tables).toHaveLength(16 * 4);
    expect(individualStageWeeks(competition, "preliminary")).toEqual([1, 2, 3, 4]);
    expect(tables.every((table) => table.stage === "preliminary")).toBe(true);
    // 16 人每周 16 桌：4 轮 × 4 桌，每人每周 4 个半庄。
    for (const week of [1, 2, 3, 4]) {
      const weekTables = tables.filter((table) => individualWeekOf(table) === week);
      expect(weekTables).toHaveLength(16);
      for (const participant of competition.participants) {
        expect(weekTables.filter((table) => table.participantIds.includes(participant.id))).toHaveLength(4);
      }
      for (const round of [1, 2, 3, 4]) {
        const seated = weekTables.filter((table) => table.round === round).flatMap((table) => table.participantIds);
        expect(new Set(seated).size).toBe(seated.length);
      }
    }
    // 随机配桌：不同周的对手组合不一样。
    const week1 = tables.filter((table) => individualWeekOf(table) === 1).map((table) => [...table.participantIds].sort().join(","));
    const week2 = tables.filter((table) => individualWeekOf(table) === 2).map((table) => [...table.participantIds].sort().join(","));
    expect(week1).not.toEqual(week2);
  });

  it("puts the legal times on Sunday and Wednesday evenings (Beijing time)", () => {
    // 第 1 周周日 20:00 = 2026-10-11T12:00Z，周二轮次 21:30 = 13:30Z，周三 20:00 = 2026-10-14T12:00Z。
    expect(individualTableTime("2026-10-11", 1, 1, settings)).toBe("2026-10-11T12:00:00.000Z");
    expect(individualTableTime("2026-10-11", 1, 2, settings)).toBe("2026-10-11T13:30:00.000Z");
    expect(individualTableTime("2026-10-11", 1, 3, settings)).toBe("2026-10-14T12:00:00.000Z");
    expect(individualTableTime("2026-10-11", 1, 4, settings)).toBe("2026-10-14T13:30:00.000Z");
    expect(individualTableTime("2026-10-11", 2, 1, settings)).toBe("2026-10-18T12:00:00.000Z");
  });

  it("waits for the whole week before the settlement button unlocks", () => {
    const competition = buildCompetition();
    // 第 1–3 周不是结算周，第 4 周是日常周的最后一周。
    expect(individualWeekSettlement(competition, 1)).toBeNull();
    const settlement = individualWeekSettlement(competition, 4);
    expect(settlement?.kind).toBe("regular");
    expect(settlement?.canSettle).toBe(false);
    expect(settlement?.reason).toContain("没有录入牌谱");
    for (const week of [1, 2, 3, 4]) playWeek(competition, week);
    expect(individualWeekSettlement(competition, 4)?.canSettle).toBe(true);
    expect(individualPendingSettlement(competition)?.week).toBe(4);
  });

  it("runs 16 → 12 → 8 → 4 with weekly eliminations and then generates the 12-game final", () => {
    const competition = buildCompetition();
    for (const week of [1, 2, 3, 4]) playWeek(competition, week);
    settlePreliminaryWeek(competition, 4);
    expect(individualStageWeeks(competition, "preliminary")).toContain(5);
    expect(competition.matches).toHaveLength(64);

    // 第 5 周：16 人（其中 4 桌是淘汰周，限制只能提前、不能顺延）。
    const week5 = (competition.individualSchedule ?? []).filter((table) => individualWeekOf(table) === 5);
    expect(week5).toHaveLength(16);
    expect(week5.every((table) => table.rules?.noPostpone && table.rules?.onlyEarlier)).toBe(true);
    playWeek(competition, 5);
    const week5Settlement = individualWeekSettlement(competition, 5);
    expect(week5Settlement?.kind).toBe("elimination");
    expect(week5Settlement?.leaving.map((item) => item.participantId)).toEqual(["p13", "p14", "p15", "p16"]);
    settlePreliminaryWeek(competition, 5);
    expect(individualEliminatedPlayers(competition).size).toBe(4);
    expect((competition.individualSchedule ?? []).filter((table) => individualWeekOf(table) === 6)).toHaveLength(12);

    playWeek(competition, 6);
    settlePreliminaryWeek(competition, 6);
    expect(individualEliminatedPlayers(competition).size).toBe(8);
    expect((competition.individualSchedule ?? []).filter((table) => individualWeekOf(table) === 7)).toHaveLength(8);

    playWeek(competition, 7);
    settlePreliminaryWeek(competition, 7);
    expect(individualEliminatedPlayers(competition).size).toBe(12);

    const final = (competition.individualSchedule ?? []).filter((table) => table.stage === "final");
    // 决赛：4 人 × 12 半庄 = 12 桌，分成 3 周。
    expect(final).toHaveLength(12);
    expect(individualStageWeeks(competition, "final")).toEqual([1, 2, 3]);
    expect(new Set(final.flatMap((table) => table.participantIds)).size).toBe(4);
    for (const participant of competition.participants) {
      expect(final.filter((table) => table.participantIds.includes(participant.id)).length).toBeLessThanOrEqual(12);
    }
    expect(final.every((table) => !table.rules)).toBe(true);
    expect(individualPendingSettlement(competition)).toBeNull();
    // 初赛积分在决赛清零。
    expect([...individualCurrentPoints(competition, "final").values()].every((points) => points === 0)).toBe(true);

    // 决赛必须排在初赛全部周次之后，不能算回开赛日附近和初赛重叠。
    const lastPreliminary = (competition.individualSchedule ?? [])
      .filter((table) => table.stage === "preliminary")
      .reduce((latest, table) => (table.scheduledAt > latest ? table.scheduledAt : latest), "");
    expect(Date.parse(final[0].scheduledAt)).toBeGreaterThan(Date.parse(lastPreliminary));
    expect(final.every((table) => Date.parse(table.scheduledAt) > Date.parse(lastPreliminary))).toBe(true);
    // 开赛日是 2026-10-11（周日），初赛 7 周到 11/25，决赛第 1 周应落在 11/29。
    expect(final[0].scheduledAt).toBe(individualTableTime("2026-10-11", 8, 1, settings));
  });

  it("refuses to settle a week whose tables are not all recorded", () => {
    const competition = buildCompetition();
    playWeek(competition, 1);
    playWeek(competition, 2);
    playWeek(competition, 3);
    expect(() => settlePreliminaryWeek(competition, 4)).toThrow("没有录入牌谱");
  });

  it("counts hand-entered adjustments when deciding who is eliminated", () => {
    const competition = buildCompetition();
    for (const week of [1, 2, 3]) playWeek(competition, week);
    // 让排名靠前的 p1 被扣到垫底，p13 因此保级。
    competition.individualAdjustments = [{ id: "a1", stage: "preliminary", participantId: "p1", points: -100000, reason: "严重违规", at: "2026-10-20T00:00:00.000Z" }];
    playWeek(competition, 4);
    settlePreliminaryWeek(competition, 4);
    playWeek(competition, 5);
    const leaving = individualWeekSettlement(competition, 5)?.leaving.map((item) => item.participantId) ?? [];
    expect(leaving).toContain("p1");
    expect(leaving).not.toContain("p13");
  });
});
