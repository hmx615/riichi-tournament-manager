import { describe, expect, it } from "vitest";
import { compareIndividualTiebreak, individualActiveStage, individualCurrentPoints, individualStageRounds, individualStageSnapshot, individualStageStandings } from "./individual-standings";
import type { Competition, IndividualStage, MatchRecord } from "./types";

function stageMatch(stage: IndividualStage, matchNumber: number, points: number[]): MatchRecord {
  return {
    id: `m${matchNumber}`, matchNumber, stage, status: "completed", playedAt: "2026-01-01", tenhouLogId: `log-${matchNumber}`, tenhouUrl: "", nagaUrl: null, reviewNote: null,
    seats: [0, 1, 2, 3].map((seat) => ({ seat: seat as 0 | 1 | 2 | 3, participantId: ["a", "b", "c", "d"][seat], sourceUsername: "", rawPoints: 25000, rank: (seat + 1) as 1 | 2 | 3 | 4, competitionPoints: points[seat], assignmentSource: "manual" })),
  };
}

function competitionWith(matches: MatchRecord[], stages: { preliminary: number; semifinal: number; final: number }): Competition {
  return {
    id: "c", name: "个人赛", code: "C", format: "individual", status: "active", plannedMatchCount: matches.length, initialPoints: 25000, rankPoints: [30, 10, -10, -30],
    participants: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, kind: "human", color: "#000", usernames: [] })),
    matches,
    individualSettings: {
      stages: {
        preliminary: { matchCountPerPlayer: stages.preliminary, advancingPlayerCount: 2 },
        semifinal: { matchCountPerPlayer: stages.semifinal, advancingPlayerCount: 2 },
        final: { matchCountPerPlayer: stages.final },
      },
      pairingMode: "balanced_opponents",
    },
  };
}

const preliminaryOnly = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30])], { preliminary: 1, semifinal: 0, final: 0 });

describe("individualStageStandings", () => {
  it("sorts by points and marks advancing players", () => {
    const rows = individualStageStandings(preliminaryOnly, "preliminary");
    expect(rows.map((row) => row.participant.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows.slice(0, 2).every((row) => row.advancing)).toBe(true);
    expect(rows[0].averageRank).toBe(1);
  });

  it("restarts from zero when entering the semifinal", () => {
    const competition = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30]), stageMatch("semifinal", 2, [0, 0, 40, -40])], { preliminary: 1, semifinal: 1, final: 0 });
    const totals = individualCurrentPoints(competition, "semifinal");
    expect(totals.get("a")).toBe(0);
    expect(totals.get("b")).toBe(0);
    expect(totals.get("c")).toBe(40);
    expect(totals.get("d")).toBe(-40);
    const rows = individualStageStandings(competition, "semifinal");
    expect(rows.map((row) => row.participant.id)).toEqual(["c", "a", "b", "d"]);
    expect(rows[0].stagePoints).toBe(40);
    expect(rows[0].carriedPoints).toBe(0);
  });

  it("restarts again when entering the final and reports the active stage", () => {
    const competition = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30]), stageMatch("semifinal", 2, [0, 0, 40, -40]), stageMatch("final", 3, [12, -12, 0, 0])], { preliminary: 1, semifinal: 1, final: 1 });
    competition.individualSchedule = [
      { id: "p1", stage: "preliminary", round: 1, tableNumber: 1, participantIds: ["a", "b", "c", "d"], scheduledAt: "2026-01-01T00:00:00.000Z", timezone: "Asia/Shanghai", status: "completed" },
      { id: "s1", stage: "semifinal", round: 1, tableNumber: 1, participantIds: ["a", "b", "c", "d"], scheduledAt: "2026-01-02T00:00:00.000Z", timezone: "Asia/Shanghai", status: "completed" },
      { id: "f1", stage: "final", round: 1, tableNumber: 1, participantIds: ["a", "b", "c", "d"], scheduledAt: "2026-01-03T00:00:00.000Z", timezone: "Asia/Shanghai", status: "scheduled" },
    ];
    expect(individualActiveStage(competition)).toBe("final");
    const totals = individualCurrentPoints(competition, "final");
    expect(totals.get("a")).toBe(12);
    expect(totals.get("b")).toBe(-12);
    expect(totals.get("c")).toBe(0);
  });

  it("counts only the stage the player actually entered", () => {
    const competition = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30]), stageMatch("final", 2, [0, 0, 0, 0])], { preliminary: 1, semifinal: 0, final: 1 });
    const totals = individualCurrentPoints(competition, "final");
    expect(totals.get("a")).toBe(0);
  });

  it("freezes the points of players who did not enter the next stage", () => {
    const semifinal: MatchRecord = {
      id: "m2", matchNumber: 2, stage: "semifinal", status: "completed", playedAt: "2026-01-02", tenhouLogId: "log-2", tenhouUrl: "", nagaUrl: null, reviewNote: null,
      seats: [0, 1].map((seat) => ({ seat: seat as 0 | 1, participantId: ["a", "b"][seat], sourceUsername: "", rawPoints: 25000, rank: (seat + 1) as 1 | 2, competitionPoints: [20, -20][seat], assignmentSource: "manual" })),
    };
    const competition = competitionWith([stageMatch("preliminary", 1, [30, 10, -10, -30]), semifinal], { preliminary: 1, semifinal: 1, final: 0 });
    const totals = individualCurrentPoints(competition, "semifinal");
    expect(totals.get("a")).toBe(20);
    expect(totals.get("b")).toBe(-20);
    // c、d 没有进入半决赛，积分冻结在初赛。
    expect(totals.get("c")).toBe(-10);
    expect(totals.get("d")).toBe(-30);
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
    const customMatch = (matchNumber: number, round: number, seats: ReturnType<typeof seat>[]): MatchRecord => ({
      id: `m${matchNumber}`, matchNumber, stage: "preliminary", round, status: "completed", playedAt: "2026-01-01", tenhouLogId: `log-${matchNumber}`,
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
      ...competitionWith([], { preliminary: 2, semifinal: 0, final: 0 }),
      participants: ["a", "b", "c", "d", "e"].map((id) => ({ id, displayName: id, kind: "human", color: "#000", usernames: [] })),
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
    expect(rows.find((row) => row.participant.id === "b")?.games).toBe(1);
  });

  it("builds a standings snapshot up to a given round", () => {
    const competition = competitionWith([
      { ...stageMatch("preliminary", 1, [30, 10, -10, -30]), round: 1 },
      { ...stageMatch("preliminary", 2, [10, 30, -30, -10]), round: 2 },
    ], { preliminary: 2, semifinal: 0, final: 0 });
    expect(individualStageRounds(competition, "preliminary")).toEqual([1, 2]);
    const afterFirst = individualStageSnapshot(competition, "preliminary", 1);
    expect(afterFirst.map((row) => row.participant.id)).toEqual(["a", "b", "c", "d"]);
    expect(afterFirst.every((row) => row.games === 1)).toBe(true);
    const afterSecond = individualStageSnapshot(competition, "preliminary", 2);
    expect(afterSecond.find((row) => row.participant.id === "a")?.points).toBe(40);
    expect(afterSecond.find((row) => row.participant.id === "b")?.points).toBe(40);
    expect(afterSecond.every((row) => row.games === 2)).toBe(true);
  });
});
