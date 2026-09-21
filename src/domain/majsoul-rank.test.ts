import { describe, expect, it } from "vitest";
import {
  formatMajsoulRank,
  isMajsoulCelestialLevel,
  majsoulRankDivision,
  majsoulRanks,
  majsoulRankTier,
} from "./majsoul-rank";

describe("Mahjong Soul ranks", () => {
  it("shares the complete rank list from Novice through Celestial", () => {
    expect(majsoulRanks).toHaveLength(16);
    expect(majsoulRanks[0]).toBe("初心1");
    expect(majsoulRanks.at(-1)).toBe("魂天");
  });

  it("extracts the official tier and numbered division", () => {
    expect(majsoulRankTier("雀豪2")).toBe("雀豪");
    expect(majsoulRankDivision("雀豪2")).toBe(2);
    expect(majsoulRankTier("魂天")).toBe("魂天");
    expect(majsoulRankDivision("魂天")).toBeNull();
  });

  it("accepts only Celestial levels 1 through 20", () => {
    expect(isMajsoulCelestialLevel(1)).toBe(true);
    expect(isMajsoulCelestialLevel(20)).toBe(true);
    expect(isMajsoulCelestialLevel(0)).toBe(false);
    expect(isMajsoulCelestialLevel(21)).toBe(false);
    expect(isMajsoulCelestialLevel(1.5)).toBe(false);
  });

  it("includes the Celestial level in display text", () => {
    expect(formatMajsoulRank("魂天", 7)).toBe("魂天 Lv.7");
    expect(formatMajsoulRank("初心1")).toBe("初心1");
  });
});
