import { describe, expect, it } from "vitest";
import {
  compareIndividualTiebreak,
  individualActiveStage,
  individualCurrentPoints,
  individualEliminatedPlayers,
  individualStageSnapshot,
  individualStageStandings,
  individualStageWeeks,
  individualWeekComplete,
} from "./individual-standings";
import type { Competition, IndividualStage, MatchRecord } from "./types";

function stageMatch(stage: IndividualStage, matchNumber: number, points: number[], week = 1, participants = ["a", "b", "c", "d"]): MatchRecord {
  return {
    id: `m${matchNumber}`, matchNumber, stage, week, status: "completed", playedAt: "2026-01-01", tenhouLogId: `log-${matchNumber}`, tenhouUrl: "", nagaUrl: null, reviewNote: null,
    seats: [0, 1, 2, 3].map((seat) => ({ seat: seat as 0 | 1 | 2 | 3, participantId: participants[seat], sourceUsername: "", rawPoints: 25000, rank: (seat + 1) as 1 | 2 | 3 | 4, competitionPoints: points[seat], assignmentSource: "manual" })),
  };
}

function competitionWith(matches: MatchRecord[], options: { participants?: string[]; schedule?: Competition["individualSchedule"] } = {}): Competition {
  const ids = options.participants ?? ["a", "b", "c", "d"];
  return {
    id: "c", name: "个人赛", code: "C", format: "individual", status: "active", plannedMatchCount: matches.length, initialPoints: 25000, rankPoints: [30, 15, -15, -30],
    participants: ids.map((id) => ({ id, displayName: id, kind: "human", color: "#000", usernames: [] })),
    matches,
    individualSchedule: options.schedule,
    individualSettings: {
      preliminary: { regularWeeks: 4, eliminationWeeks: 3, matchesPerPlayerPerWeek: 4, eliminationCountPerWeek: 4, finalistCount: 4 },
      final: { matchCountPerPlayer: 12 },
      pairingMode: "balanced_opponents",
    },
  };
}

describe("individualStageStandings", () => {
  it("sorts by cumulative preliminary points and reports games and average rank", () => {
    const competition = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30])]);
    const rows = individualStageStandings(competition, "preliminary");
    expect(rows.map((row) => row.participant.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows.map((row) => row.points)).toEqual([30, 10, -10, -30]);
    expect(rows[0].averageRank).toBe(1);
    expect(rows[0].games).toBe(1);
  });

  it("keeps preliminary points across weeks instead of resetting them", () => {
    const competition = competitionWith([
      stageMatch("preliminary", 1, [30, 10, -10, -30], 1),
      stageMatch("preliminary", 2, [10, 30, -30, -10], 2),
    ]);
    const totals = individualCurrentPoints(competition, "preliminary");
    expect(totals.get("a")).toBe(40);
    expect(totals.get("b")).toBe(40);
    expect(totals.get("c")).toBe(-40);
    expect(individualStageWeeks(competition, "preliminary")).toEqual([1, 2]);
  });

  it("restarts from zero when the final starts, and only finalists are ranked there", () => {
    const competition = competitionWith([
      stageMatch("preliminary", 1, [30, 10, -10, -30]),
      stageMatch("final", 2, [12, -12, 0, 0], 1, ["a", "b", "c", "d"]),
    ]);
    const totals = individualCurrentPoints(competition, "final");
    expect(totals.get("a")).toBe(12);
    expect(totals.get("b")).toBe(-12);
    expect(individualActiveStage(competition)).toBe("final");
    const rows = individualStageStandings(competition, "final");
    expect(rows.map((row) => row.participant.id)).toEqual(["a", "c", "d", "b"]);
  });

  it("freezes the preliminary points of eliminated players", () => {
    const competition = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30])]);
    competition.individualEliminations = [{ stage: "preliminary", week: 5, participantIds: ["c", "d"], at: "2026-01-01T00:00:00.000Z" }];
    expect(individualEliminatedPlayers(competition).get("c")).toBe(5);
    const preliminary = individualStageStandings(competition, "preliminary");
    // 被淘汰的 c、d 仍然留在初赛积分榜上，积分冻结在淘汰那一刻。
    expect(preliminary.map((row) => row.participant.id)).toEqual(["a", "b", "c", "d"]);
    expect(preliminary.find((row) => row.participant.id === "c")?.points).toBe(-10);
    expect(preliminary.filter((row) => row.eliminated).map((row) => row.participant.id)).toEqual(["c", "d"]);
  });

  it("adds hand-entered adjustments to the stage points", () => {
    const competition = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30])]);
    competition.individualAdjustments = [
      { id: "a1", stage: "preliminary", participantId: "d", points: -4, reason: "迟到 2 分钟", at: "2026-01-02T00:00:00.000Z" },
      { id: "a2", stage: "final", participantId: "d", points: -100, reason: "不该计入初赛", at: "2026-01-02T00:00:00.000Z" },
    ];
    const rows = individualStageStandings(competition, "preliminary");
    const last = rows.find((row) => row.participant.id === "d")!;
    expect(last.matchPoints).toBe(-30);
    expect(last.adjustmentPoints).toBe(-4);
    expect(last.points).toBe(-34);
  });

  it("breaks ties by average rank, then first and second places, then name", () => {
    const base = { points: 0, averageRank: 2, firstPlaceCount: 1, secondPlaceCount: 1, displayName: "甲" };
    expect(compareIndividualTiebreak(base, { ...base, displayName: "乙" })).toBeLessThan(0);
    expect(compareIndividualTiebreak(base, { ...base, averageRank: 2.5 })).toBeLessThan(0);
    expect(compareIndividualTiebreak(base, { ...base, averageRank: null })).toBeLessThan(0);
    expect(compareIndividualTiebreak(base, { ...base, firstPlaceCount: 2 })).toBeGreaterThan(0);
    expect(compareIndividualTiebreak(base, { ...base, secondPlaceCount: 2 })).toBeGreaterThan(0);
    expect(compareIndividualTiebreak(base, { ...base, points: 5 })).toBeGreaterThan(0);
  });

  it("ranks equal points by average rank in the standings", () => {
    const seat = (participantId: string, rank: 1 | 2 | 3 | 4, competitionPoints: number) => ({ participantId, rank, competitionPoints });
    const customMatch = (matchNumber: number, week: number, seats: ReturnType<typeof seat>[]): MatchRecord => ({
      id: `m${matchNumber}`, matchNumber, stage: "preliminary", week, status: "completed", playedAt: "2026-01-01", tenhouLogId: `log-${matchNumber}`,
      tenhouUrl: "", nagaUrl: null, reviewNote: null,
      seats: seats.map((item, index) => ({
        seat: index as 0 | 1 | 2 | 3,
        participantId: item.participantId,
        sourceUsername: "",
        rawPoints: 25000,
        rank: item.rank,
        competitionPoints: item.competitionPoints,
        assignmentSource: "manual" as const,
      })),
    });
    const competition: Competition = {
      ...competitionWith([], { participants: ["a", "b", "c", "d", "e"] }),
      matches: [
        customMatch(1, 1, [seat("a", 1, 30), seat("b", 2, 0), seat("c", 3, 0), seat("d", 4, -30)]),
        customMatch(2, 2, [seat("a", 4, -30), seat("e", 1, 30), seat("c", 2, 0), seat("d", 3, 0)]),
      ],
    };
    const rows = individualStageStandings(competition, "preliminary");
    // a、b、c 都是 0 分：b 只打一场、平均顺位 2.0 最好；a 与 c 平均顺位相同，按一位次数决胜。
    expect(rows.map((row) => row.participant.id)).toEqual(["e", "b", "a", "c", "d"]);
    expect(rows.map((row) => row.points)).toEqual([30, 0, 0, 0, -30]);
    expect(rows.map((row) => row.averageRank)).toEqual([1, 2, 2.5, 2.5, 3.5]);
  });

  it("builds a standings snapshot up to a given week", () => {
    const competition = competitionWith([
      stageMatch("preliminary", 1, [30, 10, -10, -30], 1),
      stageMatch("preliminary", 2, [10, 30, -30, -10], 2),
    ]);
    const afterFirst = individualStageSnapshot(competition, "preliminary", 1);
    expect(afterFirst.every((row) => row.games === 1)).toBe(true);
    expect(afterFirst.map((row) => row.points)).toEqual([30, 10, -10, -30]);
    const afterSecond = individualStageSnapshot(competition, "preliminary", 2);
    expect(afterSecond.find((row) => row.participant.id === "a")?.points).toBe(40);
    expect(afterSecond.every((row) => row.games === 2)).toBe(true);
  });

  it("knows whether a week has been fully recorded", () => {
    const table = (id: string, week: number, round: number, done: boolean) => ({
      id, stage: "preliminary" as const, week, round, tableNumber: 1, participantIds: ["a", "b", "c", "d"],
      scheduledAt: "2026-10-11T12:00:00.000Z", timezone: "Asia/Shanghai", status: done ? "completed" as const : "scheduled" as const,
    });
    const competition = competitionWith([{ ...stageMatch("preliminary", 1, [30, 10, -10, -30], 1), round: 1, tableNumber: 1 }], {
      schedule: [table("t1", 1, 1, false), table("t2", 2, 1, false)],
    });
    expect(individualWeekComplete(competition, "preliminary", 1)).toBe(true);
    expect(individualWeekComplete(competition, "preliminary", 2)).toBe(false);
  });
});
