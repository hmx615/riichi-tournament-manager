import { describe, expect, it } from "vitest";
import { individualStageStandings } from "./individual-standings";
import type { Competition } from "./types";

const competition: Competition = {
  id: "c", name: "个人赛", code: "C", format: "individual", status: "active", plannedMatchCount: 2, initialPoints: 25000, rankPoints: [30, 10, -10, -30],
  participants: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, kind: "human", color: "#000", usernames: [] })), matches: [{ id: "m", matchNumber: 1, stage: "preliminary", status: "completed", playedAt: "2026-01-01", tenhouLogId: "m", tenhouUrl: "", nagaUrl: null, reviewNote: null, seats: [0, 1, 2, 3].map((seat) => ({ seat: seat as 0 | 1 | 2 | 3, participantId: ["a", "b", "c", "d"][seat], sourceUsername: "", rawPoints: 25000, rank: (seat + 1) as 1 | 2 | 3 | 4, competitionPoints: [30, 10, -10, -30][seat], assignmentSource: "manual" })) }],
  individualSettings: { stages: { preliminary: { matchCountPerPlayer: 1, advancingPlayerCount: 2 }, semifinal: { matchCountPerPlayer: 0 }, final: { matchCountPerPlayer: 0 } }, pairingMode: "balanced_opponents" },
};

describe("individualStageStandings", () => {
  it("sorts by points and marks advancing players", () => {
    const rows = individualStageStandings(competition, "preliminary");
    expect(rows.map((row) => row.participant.id)).toEqual(["a", "b", "c", "d"]);
    expect(rows.slice(0, 2).every((row) => row.advancing)).toBe(true);
    expect(rows[0].averageRank).toBe(1);
  });
});
