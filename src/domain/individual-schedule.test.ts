import { describe, expect, it } from "vitest";
import { generateIndividualSchedule, planIndividualSchedule } from "./individual-schedule";

describe("generateIndividualSchedule", () => {
  it("gives every player the target number of games", () => {
    const tables = generateIndividualSchedule(["a", "b", "c", "d", "e", "f", "g", "h"], "preliminary", 2);
    expect(tables).toHaveLength(4);
    const counts = new Map<string, number>();
    tables.flatMap((table) => table.participantIds).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    expect([...counts.values()]).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });
  it("rejects duplicate participants", () => expect(() => generateIndividualSchedule(["a", "a", "b", "c"], "final", 1)).toThrow("参赛者不能重复"));
  it.each([[8, 4, 8], [6, 4, 6], [4, 4, 4], [5, 4, 5], [12, 3, 9]])("balances %i players over %i games", (count, games, tableCount) => {
    const ids = Array.from({ length: count }, (_, i) => String(i));
    const tables = generateIndividualSchedule(ids, "semifinal", games);
    expect(tables).toHaveLength(tableCount);
    for (const id of ids) expect(tables.filter((t) => t.participantIds.includes(id))).toHaveLength(games);
    for (const round of new Set(tables.map((t) => t.round))) {
      const seated = tables.filter((t) => t.round === round).flatMap((t) => t.participantIds);
      expect(new Set(seated).size).toBe(seated.length);
    }
    if (count > 4) expect(new Set(tables.map((t) => [...t.participantIds].sort().join(","))).size).toBeGreaterThan(2);
  });
  it("changes opponents after the first round for eight players", () => {
    const tables = generateIndividualSchedule(["a", "b", "c", "d", "e", "f", "g", "h"], "preliminary", 4);
    expect(tables[2].participantIds).not.toEqual(tables[0].participantIds);
    const opponents = new Set(tables.filter((t) => t.participantIds.includes("a")).flatMap((t) => t.participantIds));
    expect(opponents.size).toBe(8);
  });
  it("rejects schedules whose equal game totals cannot form four-player tables", () => {
    expect(() => generateIndividualSchedule(["a", "b", "c", "d", "e", "f"], "semifinal", 3)).toThrow("4 的倍数");
  });
  it("satisfies all feasible small tournament sizes and game counts", () => {
    for (let count = 4; count <= 24; count++) {
      for (let games = 1; games <= 8; games++) {
        if (count * games % 4) continue;
        const ids = Array.from({ length: count }, (_, i) => String(i));
        const tables = generateIndividualSchedule(ids, "preliminary", games);
        expect(tables).toHaveLength(count * games / 4);
        for (const id of ids) expect(tables.filter((table) => table.participantIds.includes(id))).toHaveLength(games);
        for (const round of new Set(tables.map((table) => table.round))) {
          const players = tables.filter((table) => table.round === round).flatMap((table) => table.participantIds);
          expect(new Set(players).size).toBe(players.length);
        }
      }
    }
  });

  it("seats uneven player counts with byes instead of inventing a fourth player", () => {
    const plan = planIndividualSchedule(["a", "b", "c", "d", "e"], "preliminary", 2, { allowUnevenGames: true });
    expect(plan.tables).toHaveLength(2);
    const games = new Map<string, number>();
    for (const table of plan.tables) for (const id of table.participantIds) games.set(id, (games.get(id) ?? 0) + 1);
    const played = [...games.values()];
    expect(played.sort()).toEqual([1, 1, 2, 2, 2]);
    expect(plan.byes).toHaveLength(2);
    for (const bye of plan.byes) {
      expect(games.get(bye.participantId)).toBeLessThan(2);
    }
  });

  it("keeps games within one game of each other for every uneven roster", () => {
    for (let count = 4; count <= 24; count++) {
      for (let games = 1; games <= 8; games++) {
        const ids = Array.from({ length: count }, (_, index) => String(index));
        const plan = planIndividualSchedule(ids, "preliminary", games, { allowUnevenGames: true });
        const played = new Map(ids.map((id) => [id, 0]));
        for (const table of plan.tables) {
          expect(table.participantIds).toHaveLength(4);
          expect(new Set(table.participantIds).size).toBe(4);
          for (const id of table.participantIds) played.set(id, played.get(id)! + 1);
        }
        for (const round of new Set(plan.tables.map((table) => table.round))) {
          const seated = plan.tables.filter((table) => table.round === round).flatMap((table) => table.participantIds);
          expect(new Set(seated).size).toBe(seated.length);
        }
        const values = [...played.values()];
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
        expect(plan.byes).toHaveLength(count * games % 4);
        expect(new Set(plan.byes.map((bye) => bye.participantId)).size).toBe(plan.byes.length);
        for (const bye of plan.byes) expect(played.get(bye.participantId)!).toBe(games - 1);
        for (const bye of plan.byes) expect(bye.stage).toBe("preliminary");
      }
    }
  });

  it("still refuses uneven totals unless the caller opts in", () => {
    expect(() => planIndividualSchedule(["a", "b", "c", "d", "e"], "semifinal", 2)).toThrow("4 的倍数");
  });

  it("rejects rosters smaller than one table", () => {
    expect(() => planIndividualSchedule(["a", "b", "c"], "final", 4, { allowUnevenGames: true })).toThrow("至少需要 4 名选手");
  });
});
