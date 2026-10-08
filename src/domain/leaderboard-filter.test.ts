import { describe, expect, it } from "vitest";
import type { Person } from "@/domain/types";
import {
  leaderboardTagOptions,
  matchesLeaderboardTags,
  parseLeaderboardFilterOpen,
  parseLeaderboardTagSelection,
  serializeLeaderboardFilterOpen,
  serializeLeaderboardTagSelection,
} from "./leaderboard-filter";

const person = (displayName: string, tags?: string[], kind: Person["kind"] = "human"): Person => ({
  id: displayName,
  displayName,
  kind,
  color: "#168f83",
  aliases: [],
  accounts: [],
  ...(tags === undefined ? {} : { tags }),
});

describe("leaderboard tag options", () => {
  it("counts people per tag and lets the default tag cover legacy profiles", () => {
    const roster = [person("甲"), person("乙", ["国企办公厅", "校外"]), person("丙", ["校外"]), person("AI", [], "ai")];

    expect(leaderboardTagOptions(roster)).toEqual([
      { tag: "国企办公厅", count: 2 },
      { tag: "校外", count: 2 },
    ]);
  });
});

describe("matchesLeaderboardTags", () => {
  const 校外选手 = person("校外选手", ["校外"]);
  const 办公厅选手 = person("办公厅选手");

  it("shows everyone when nothing is selected", () => {
    expect(matchesLeaderboardTags(校外选手, [])).toBe(true);
    expect(matchesLeaderboardTags(办公厅选手, [])).toBe(true);
  });

  it("keeps only people carrying at least one selected tag", () => {
    expect(matchesLeaderboardTags(校外选手, ["校外"])).toBe(true);
    expect(matchesLeaderboardTags(办公厅选手, ["校外"])).toBe(false);
    expect(matchesLeaderboardTags(办公厅选手, ["校外", "国企办公厅"])).toBe(true);
  });

  it("never matches tagless AI profiles once a tag is selected", () => {
    expect(matchesLeaderboardTags(person("AI", [], "ai"), ["校外"])).toBe(false);
  });
});

describe("tag selection cookie", () => {
  it("round-trips Chinese tags through the cookie value", () => {
    const value = serializeLeaderboardTagSelection(["校外", "国企办公厅"]);

    expect(value).not.toContain("校外");
    expect(parseLeaderboardTagSelection(value, ["校外", "国企办公厅"])).toEqual(["校外", "国企办公厅"]);
  });

  it("drops tags that no longer exist so a deleted tag cannot filter the board to nothing", () => {
    const value = serializeLeaderboardTagSelection(["已删除", "校外"]);

    expect(parseLeaderboardTagSelection(value, ["校外"])).toEqual(["校外"]);
    expect(parseLeaderboardTagSelection(value, [])).toEqual([]);
  });

  it("falls back to showing everyone for missing or malformed cookies", () => {
    expect(parseLeaderboardTagSelection(undefined, ["校外"])).toEqual([]);
    expect(parseLeaderboardTagSelection("不是 JSON", ["校外"])).toEqual([]);
    expect(parseLeaderboardTagSelection(encodeURIComponent('{"tag":"校外"}'), ["校外"])).toEqual([]);
  });
});

describe("filter box cookie", () => {
  it("round-trips the open and closed states", () => {
    expect(parseLeaderboardFilterOpen(serializeLeaderboardFilterOpen(false))).toBe(false);
    expect(parseLeaderboardFilterOpen(serializeLeaderboardFilterOpen(true))).toBe(true);
  });

  it("keeps the filter expanded for first-time visitors and broken values", () => {
    expect(parseLeaderboardFilterOpen(undefined)).toBe(true);
    expect(parseLeaderboardFilterOpen("")).toBe(true);
    expect(parseLeaderboardFilterOpen("maybe")).toBe(true);
  });
});
