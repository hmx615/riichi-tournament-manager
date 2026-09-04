import { describe, expect, it } from "vitest";
import { estimateRank, estimateRankByDecision, estimateRankByGame, estimateRankByHand, formatEstimatedRank } from "./estimated-rank";

describe("estimated rank", () => {
  it("converts weighted metrics within each model before combining models", () => {
    expect(estimateRank([
      { model: "ニシキ", rating: 90.3, agreementRate: 0.791, badMoveRate: 0.042, decisionCount: 100 },
      { model: "カガシ", rating: 88.3, agreementRate: 0.774, badMoveRate: 0.058, decisionCount: 100 },
    ])).toBe(9.5);
  });

  it("uses equal game weights by default while preserving the decision-weighted estimator", () => {
    const ratings = [
      { model: "ニシキ", rating: 79.4, agreementRate: 0.656, badMoveRate: 0.151, decisionCount: 1 },
      { model: "ニシキ", rating: 90.6, agreementRate: 0.795, badMoveRate: 0.039, decisionCount: 100 },
    ];

    expect(estimateRank(ratings)).toBe(5.2);
    expect(estimateRankByGame(ratings)).toBe(5.2);
    expect(estimateRankByDecision(ratings)).toBe(9.6);
    expect(estimateRankByHand(ratings)).toBe(5.2);
  });

  it("clamps values to the official first-to-tenth-rank range", () => {
    expect(estimateRank([{ model: "ニシキ", rating: 100, agreementRate: 1, badMoveRate: 0, decisionCount: 1 }])).toBe(10);
    expect(estimateRank([{ model: "ニシキ", rating: 0, agreementRate: 0, badMoveRate: 1, decisionCount: 1 }])).toBe(1);
  });

  it("returns null without a supported NAGA model", () => {
    expect(estimateRank([])).toBeNull();
    expect(estimateRank([{ model: "unknown", rating: 90, agreementRate: 0.8, badMoveRate: 0.05, decisionCount: 100 }])).toBeNull();
  });

  it("formats calculated and fixed AI ranks", () => {
    expect(formatEstimatedRank(9.35)).toBe("9.3段");
    expect(formatEstimatedRank("10+")).toBe("10+段");
    expect(formatEstimatedRank(null)).toBe("-");
  });
});
