import { describe, expect, it } from "vitest";
import type { MatchRecord } from "./types";
import { matchQuality } from "./match-quality";

function matchWithRatings(values: Array<[number, number]>): MatchRecord {
  return {
    id: "match-1",
    matchNumber: 1,
    status: "completed",
    playedAt: "2026-09-04T12:00:00+08:00",
    tenhouLogId: "log-1",
    tenhouUrl: "",
    nagaUrl: null,
    seats: values.map((_, seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      participantId: `player-${seat}`,
      sourceUsername: `player-${seat}`,
      rawPoints: 25000,
      rank: (seat + 1) as 1 | 2 | 3 | 4,
      competitionPoints: 0,
      assignmentSource: "manual",
    })),
    nagaRatings: values.flatMap(([nishiki, kagashi], seat) => [
      { participantId: `player-${seat}`, model: "ニシキ", rating: nishiki, agreementRate: 0.8, badMoveRate: 0.05, decisionCount: 100 },
      { participantId: `player-${seat}`, model: "カガシ", rating: kagashi, agreementRate: 0.8, badMoveRate: 0.05, decisionCount: 100 },
    ]),
    reviewNote: null,
  };
}

describe("match quality", () => {
  it("marks all eight ratings over 90 as diamond", () => {
    expect(matchQuality(matchWithRatings([[91, 92], [93, 94], [95, 96], [97, 98]]))).toBe("diamond");
  });

  it("marks four player maximums over 90 as gold", () => {
    expect(matchQuality(matchWithRatings([[91, 89], [88, 92], [93, 87], [86, 94]]))).toBe("gold");
  });

  it("requires strict scores over 90 and complete two-model data", () => {
    expect(matchQuality(matchWithRatings([[90, 89], [91, 92], [93, 94], [95, 96]]))).toBeNull();
    const incomplete = matchWithRatings([[91, 92], [93, 94], [95, 96], [97, 98]]);
    incomplete.nagaRatings = incomplete.nagaRatings?.filter((rating) => !(rating.participantId === "player-3" && rating.model === "カガシ"));
    expect(matchQuality(incomplete)).toBeNull();
  });
});
