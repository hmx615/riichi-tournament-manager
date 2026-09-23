import { describe, expect, it } from "vitest";
import type { Person } from "@/domain/types";
import type { PersonStatistics } from "@/server/person-statistics";
import { compareLeaderboardPeople } from "./leaderboard";

function statistics(displayName: string, points: number, matchCount: number): PersonStatistics {
  const person: Person = {
    id: displayName,
    displayName,
    kind: "human",
    color: "#168f83",
    aliases: [displayName],
    accounts: [],
  };

  return {
    person,
    totalCompetitionPoints: points,
    estimatedRank: null,
    estimatedRankPrecise: null,
    summary: {},
    rankCounts: [0, 0, 0, 0],
    ratings: [],
    quality: { eligibleCount: 0, diamondRate: null, goldRate: null, horseRate: null },
    competitions: [],
    matches: Array.from({ length: matchCount }, (_, index) => ({
      competitionId: "test-cup",
      competitionName: "Test Cup",
      matchNumber: index + 1,
      playedAt: "2026-09-22T12:00:00+08:00",
      rank: 1,
      rawPoints: 35000,
      competitionPoints: points,
      sourceUsername: displayName,
      tenhouUrl: "",
      nagaUrl: null,
      nagaRatings: {},
      nagaQuality: null,
      hasCompleteNagaRating: false,
    })),
  };
}

describe("compareLeaderboardPeople", () => {
  it("puts every player with matches ahead of players without matches", () => {
    const playedWithNegativePoints = statistics("有场次", -100, 1);
    const unplayedWithZeroPoints = statistics("零场次", 0, 0);

    expect([unplayedWithZeroPoints, playedWithNegativePoints].sort(compareLeaderboardPeople))
      .toEqual([playedWithNegativePoints, unplayedWithZeroPoints]);
  });

  it("sorts players with matches by points before match count", () => {
    const lowerScoreMoreMatches = statistics("低分多场", 20, 10);
    const higherScoreFewerMatches = statistics("高分少场", 30, 1);

    expect([lowerScoreMoreMatches, higherScoreFewerMatches].sort(compareLeaderboardPeople))
      .toEqual([higherScoreFewerMatches, lowerScoreMoreMatches]);
  });

  it("uses match count and then name to break equal-score ties", () => {
    const fewerMatches = statistics("C", 30, 1);
    const laterName = statistics("B", 30, 2);
    const earlierName = statistics("A", 30, 2);

    expect([fewerMatches, laterName, earlierName].sort(compareLeaderboardPeople))
      .toEqual([earlierName, laterName, fewerMatches]);
  });
});
