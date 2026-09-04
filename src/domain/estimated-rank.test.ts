import { describe, expect, it } from "vitest";
import { estimateRank } from "./estimated-rank";

describe("estimated rank", () => {
  it("converts weighted metrics within each model before combining models", () => {
    expect(estimateRank([
      { model: "ニシキ", rating: 90.3, agreementRate: 0.791, badMoveRate: 0.042, decisionCount: 100 },
      { model: "カガシ", rating: 88.3, agreementRate: 0.774, badMoveRate: 0.058, decisionCount: 100 },
    ])).toBe(9.5);
  });

  it("gives a long report more influence than a very short report", () => {
    expect(estimateRank([
      { model: "ニシキ", rating: 79.4, agreementRate: 0.656, badMoveRate: 0.151, decisionCount: 1 },
      { model: "ニシキ", rating: 90.6, agreementRate: 0.795, badMoveRate: 0.039, decisionCount: 100 },
    ])).toBe(9.6);
  });

  it("clamps values to the official first-to-tenth-rank range", () => {
    expect(estimateRank([{ model: "ニシキ", rating: 100, agreementRate: 1, badMoveRate: 0, decisionCount: 1 }])).toBe(10);
    expect(estimateRank([{ model: "ニシキ", rating: 0, agreementRate: 0, badMoveRate: 1, decisionCount: 1 }])).toBe(1);
  });

  it("returns null without a supported NAGA model", () => {
    expect(estimateRank([])).toBeNull();
    expect(estimateRank([{ model: "unknown", rating: 90, agreementRate: 0.8, badMoveRate: 0.05, decisionCount: 100 }])).toBeNull();
  });
});
