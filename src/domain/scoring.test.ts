import { describe, expect, it } from "vitest";
import { calculateCompetitionPoints, ranksFromRawPoints } from "./scoring";

describe("competition scoring", () => {
  it("uses raw points and +30/+10/-10/-30 rank points", () => {
    const raw = [47200, 25800, 16400, 10600];
    expect(ranksFromRawPoints(raw)).toEqual([1, 2, 3, 4]);
    expect(calculateCompetitionPoints(raw, 25000, [30, 10, -10, -30])).toEqual([52.2, 10.8, -18.6, -44.4]);
  });

  it("breaks equal points by seat order, matching the current importer", () => {
    expect(ranksFromRawPoints([25000, 25000, 25000, 25000])).toEqual([1, 2, 3, 4]);
  });
});
