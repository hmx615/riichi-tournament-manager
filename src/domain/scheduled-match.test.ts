import { describe, expect, it } from "vitest";
import { completeScheduledMatch, entrySchedule } from "./scheduled-match";
import type { Competition, MatchRecord } from "./types";

export function fixture() {
  const competition: Competition = {
    id: "scheduled-test", name: "Test", code: "TEST", format: "individual", status: "active", plannedMatchCount: 8, initialPoints: 25000, rankPoints: [30, 10, -10, -30],
    participants: ["a", "b", "c", "d", "e"].map((id) => ({ id, displayName: id, kind: "human", color: "#000000", usernames: [id] })), matches: [],
    individualSchedule: [{ id: "s1", stage: "preliminary", round: 1, tableNumber: 2, scheduledAt: "2026-09-12T12:00:00Z", timezone: "Asia/Shanghai", participantIds: ["a", "b", "c", "d"], status: "scheduled" }],
  };
  const match: MatchRecord = { id: "m1", matchNumber: 1, scheduleId: "s1", status: "completed", playedAt: "2026-09-12T12:00:00Z", tenhouLogId: "log1", tenhouUrl: "", nagaUrl: null, reviewNote: null,
    seats: ["d", "b", "a", "c"].map((id, seat) => ({ seat: seat as 0 | 1 | 2 | 3, participantId: id, sourceUsername: id, rawPoints: 25000, rank: (seat + 1) as 1 | 2 | 3 | 4, competitionPoints: 0, assignmentSource: "manual" })),
  };
  return { competition, match };
}

describe("scheduled match association", () => {
  it("links a reordered set of four seats and marks the table complete", () => {
    const { competition, match } = fixture();
    completeScheduledMatch(competition, match);
    expect(match).toMatchObject({ stage: "preliminary", round: 1, tableNumber: 2 });
    expect(competition.individualSchedule![0]).toMatchObject({ status: "completed", matchNumber: 1 });
    expect(() => completeScheduledMatch(competition, { ...match, matchNumber: 2 })).toThrow("已经录入");
  });
  it("rejects a missing or cancelled table", () => {
    const { competition } = fixture();
    expect(() => entrySchedule(competition, "")).toThrow("具体赛程");
    competition.individualSchedule![0].status = "cancelled";
    expect(() => entrySchedule(competition, "s1")).toThrow("已取消");
  });
  it.each(["e", "b"])("rejects a foreign or duplicated participant %s", (id) => {
    const { competition, match } = fixture();
    match.seats[0].participantId = id;
    expect(() => completeScheduledMatch(competition, match)).toThrow("四名选手");
    expect(competition.individualSchedule![0].status).toBe("scheduled");
  });
});
