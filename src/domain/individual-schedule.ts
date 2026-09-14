import type { IndividualScheduleTable, IndividualStage } from "./types";

export type ScheduledTable = Pick<IndividualScheduleTable, "stage" | "round" | "tableNumber" | "participantIds">;

/** Prioritize remaining games, then minimize repeated opponents at each selection. */
export function generateIndividualSchedule(participantIds: string[], stage: IndividualStage, gamesPerPlayer: number): ScheduledTable[] {
  if (!Number.isInteger(gamesPerPlayer) || gamesPerPlayer < 0) throw new Error("每人半庄数必须是非负整数");
  if (new Set(participantIds).size !== participantIds.length) throw new Error("参赛者不能重复");
  if (gamesPerPlayer === 0 || participantIds.length === 0) return [];
  if (participantIds.length < 4 || participantIds.length * gamesPerPlayer % 4 !== 0) throw new Error("人数乘以每人半庄数必须是 4 的倍数，且至少有 4 名选手");
  const remaining = new Map(participantIds.map((id) => [id, gamesPerPlayer]));
  const tables: ScheduledTable[] = [];
  const pairs = new Map<string, number>();
  const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
  let round = 1;
  let roundPlayers = new Set<string>();
  let tableNumber = 1;
  while ([...remaining.values()].some((count) => count > 0)) {
    const group: string[] = [];
    while (group.length < 4) {
      const candidates = participantIds.filter((id) => remaining.get(id)! > 0 && !group.includes(id));
      const repetition = (id: string) => group.reduce((sum, other) => sum + (pairs.get(pairKey(id, other)) ?? 0) ** 2, 0);
      candidates.sort((a, b) => remaining.get(b)! - remaining.get(a)! || repetition(a) - repetition(b) || participantIds.indexOf(a) - participantIds.indexOf(b));
      if (!candidates.length) throw new Error("无法满足每名选手的目标半庄数");
      group.push(candidates[0]);
    }
    if (group.some((id) => roundPlayers.has(id))) { round += 1; tableNumber = 1; roundPlayers = new Set(); }
    for (let i = 0; i < group.length; i++) {
      remaining.set(group[i], remaining.get(group[i])! - 1);
      roundPlayers.add(group[i]);
      for (const other of group.slice(i + 1)) {
        const key = pairKey(group[i], other);
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    tables.push({ stage, round, tableNumber: tableNumber++, participantIds: group });
  }
  return tables;
}
