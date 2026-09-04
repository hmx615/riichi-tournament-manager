import { describe, expect, it } from "vitest";
import { summarizeNagaMetrics } from "./naga-summary";

describe("NAGA metric summary", () => {
  it("weights every metric by its effective decision count", () => {
    const summary = summarizeNagaMetrics([
      { rating: 0, agreementRate: 0, badMoveRate: 1, decisionCount: 1 },
      { rating: 100, agreementRate: 1, badMoveRate: 0, decisionCount: 100 },
    ]);

    expect(summary).toMatchObject({ gameCount: 2, decisionCount: 101 });
    expect(summary?.rating).toBeCloseTo(99.0099, 4);
    expect(summary?.agreementRate).toBeCloseTo(100 / 101, 6);
    expect(summary?.badMoveRate).toBeCloseTo(1 / 101, 6);
  });

  it("ignores invalid or empty observations", () => {
    expect(summarizeNagaMetrics([])).toBeNull();
    expect(summarizeNagaMetrics([{ rating: 90, agreementRate: 0.8, badMoveRate: 0.05, decisionCount: 0 }])).toBeNull();
  });
});
