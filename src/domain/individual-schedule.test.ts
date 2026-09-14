import { describe, expect, it } from "vitest";
import { generateIndividualSchedule } from "./individual-schedule";

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
});
