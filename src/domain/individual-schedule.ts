import type { IndividualScheduleTable, IndividualStage, IndividualStageBye } from "./types";

export type ScheduledTable = Pick<IndividualScheduleTable, "stage" | "week" | "round" | "tableNumber" | "participantIds">;
export type SchedulePlan = { tables: ScheduledTable[]; byes: IndividualStageBye[] };
export type ScheduleOptions = {
  /**
   * 报名人数不是 4 的倍数时，允许实际半庄数相差 1：
   * 由 (人数 × 每人半庄数) 除以 4 的余数决定有几人少打一个半庄，并在对应轮次记为轮空。
   */
  allowUnevenGames?: boolean;
  /**
   * 随机配桌的种子。给了就按种子打乱候选顺序，做到"随机分对手"；
   * 固定种子是为了同一份输入永远排出同一批桌次，重新生成不会换对手。
   */
  seed?: number;
  /** 之前各周已经同桌过的次数（key 为 "选手A|选手B"），用于跨周尽量不重复对手。 */
  priorPairs?: Record<string, number>;
};

export function pairKey(left: string, right: string) {
  return [left, right].sort().join("|");
}

/** 统计一批桌次里每对选手同桌过几次，用于下一周继续避开重复对手。 */
export function opponentPairCounts(tables: ReadonlyArray<{ participantIds: string[] }>) {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    for (let i = 0; i < table.participantIds.length; i += 1) {
      for (let j = i + 1; j < table.participantIds.length; j += 1) {
        const key = pairKey(table.participantIds[i], table.participantIds[j]);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/** 固定种子的伪随机数，保证"随机配桌"可复现。 */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number) {
  const random = mulberry32(seed);
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * 排桌：每轮把还能打的选手按 4 人一桌切开，硬约束是「同一轮同一选手只能坐一桌、单桌四人互不重复」，
 * 软目标是尽量少让相同的对手重复相遇（按已相遇次数的平方惩罚）。
 * 人数不是 4 的倍数时，落单的选手在该轮轮空并少打一个半庄（最多只少 1 个）。
 */
export function planIndividualSchedule(participantIds: string[], stage: IndividualStage, gamesPerPlayer: number, options: ScheduleOptions = {}): SchedulePlan {
  if (!Number.isInteger(gamesPerPlayer) || gamesPerPlayer < 0) throw new Error("每人半庄数必须是非负整数");
  if (new Set(participantIds).size !== participantIds.length) throw new Error("参赛者不能重复");
  if (gamesPerPlayer === 0 || participantIds.length === 0) return { tables: [], byes: [] };
  if (participantIds.length < 4) throw new Error("至少需要 4 名选手才能排桌");
  if (participantIds.length * gamesPerPlayer % 4 !== 0 && !options.allowUnevenGames) {
    throw new Error("人数乘以每人半庄数必须是 4 的倍数；或允许部分选手少打一个半庄（轮空）");
  }
  const seatOrder = new Map((options.seed === undefined ? participantIds : shuffled(participantIds, options.seed)).map((id, index) => [id, index]));
  const remaining = new Map(participantIds.map((id) => [id, gamesPerPlayer]));
  const tables: ScheduledTable[] = [];
  const byes: IndividualStageBye[] = [];
  const pairs = new Map<string, number>(Object.entries(options.priorPairs ?? {}));
  let round = 1;
  let roundPlayers = new Set<string>();
  let tableNumber = 1;
  while ([...remaining.values()].some((count) => count > 0)) {
    const pending = participantIds.filter((id) => remaining.get(id)! > 0);
    const available = pending.filter((id) => !roundPlayers.has(id));
    if (available.length < 4) {
      if (pending.length < 4) {
        // 剩下的人凑不满一桌：本阶段他们少打一个半庄，记为轮空（不虚构第四名选手）。
        for (const id of pending) {
          byes.push({ stage, participantId: id });
          remaining.set(id, 0);
        }
        break;
      }
      // 还有足够的人：只是这一轮坐满了，进入下一轮继续排。
      round += 1;
      roundPlayers = new Set();
      tableNumber = 1;
      continue;
    }
    const group: string[] = [];
    while (group.length < 4) {
      const candidates = available.filter((id) => !group.includes(id));
      const repetition = (id: string) => group.reduce((sum, other) => sum + (pairs.get(pairKey(id, other)) ?? 0) ** 2, 0);
      candidates.sort((a, b) => remaining.get(b)! - remaining.get(a)! || repetition(a) - repetition(b) || seatOrder.get(a)! - seatOrder.get(b)!);
      if (!candidates.length) throw new Error("无法满足每名选手的目标半庄数");
      group.push(candidates[0]);
    }
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
  return { tables, byes };
}

/** 只关心桌次时使用；人数不能整除 4 时按报错处理。 */
export function generateIndividualSchedule(participantIds: string[], stage: IndividualStage, gamesPerPlayer: number, options: ScheduleOptions = {}): ScheduledTable[] {
  return planIndividualSchedule(participantIds, stage, gamesPerPlayer, options).tables;
}

/** 排某一周（每人 matchesPerPlayerPerWeek 个半庄）的桌次，并带上周次。 */
export function planIndividualWeek(
  participantIds: string[],
  stage: IndividualStage,
  week: number,
  matchesPerPlayerPerWeek: number,
  options: ScheduleOptions = {},
) {
  const plan = planIndividualSchedule(participantIds, stage, matchesPerPlayerPerWeek, options);
  return { tables: plan.tables.map((table) => ({ ...table, week })), byes: plan.byes };
}
