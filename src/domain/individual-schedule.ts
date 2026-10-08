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
  /** 每天几轮；大于 1 时同一天同桌固定不变（一个分组连打几场）。 */
  roundsPerDay?: number;
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
  // 每天几轮。同一天内同桌不变：一个分组连打 roundsPerDay 场，对手是同一批人。
  const roundsPerDay = Math.max(1, Math.round(options.roundsPerDay ?? 1));
  const remaining = new Map(participantIds.map((id) => [id, gamesPerPlayer]));
  const tables: ScheduledTable[] = [];
  const byes: IndividualStageBye[] = [];
  const pairs = new Map<string, number>(Object.entries(options.priorPairs ?? {}));
  const tiebreakOrder = new Map((options.seed === undefined ? participantIds : shuffled(participantIds, options.seed)).map((id, index) => [id, index]));
  // 人数不是 4 的倍数时，一天坐不满的选手留着剩余场次，后面几天轮换上场；
  // 只有再也没人能和��凑一桌时，才记为轮空。
  const maxDays = gamesPerPlayer * 4 + participantIds.length;

  for (let day = 1; day <= maxDays; day += 1) {
    if (![...remaining.values()].some((count) => count > 0)) break;
    const pending = participantIds.filter((id) => remaining.get(id)! > 0);
    if (pending.length < 4) {
      for (const id of pending) { byes.push({ stage, participantId: id }); remaining.set(id, 0); }
      break;
    }

    const pool = options.seed === undefined ? pending : shuffled(pending, (options.seed + day * 2654435761) >>> 0);
    const used = new Set<string>();
    const groups: string[][] = [];
    for (const first of pool) {
      if (used.has(first)) continue;
      const group = [first];
      used.add(first);
      // 每多拉一个人都优先挑「已经遇上次数最少」的，重复对手按平方惩罚。
      while (group.length < 4) {
        const candidates = pool.filter((id) => !used.has(id));
        if (!candidates.length) break;
        const penalty = (id: string) => group.reduce((sum, other) => sum + (pairs.get(pairKey(id, other)) ?? 0) ** 2, 0);
        // 先照顾「还没打够的人」，再照顾「少遇过的对手」：
        // 人数整齐时两者一样，退化成按对手重复度随机分桌。
        candidates.sort((a, b) => remaining.get(b)! - remaining.get(a)!
          || penalty(a) - penalty(b)
          || tiebreakOrder.get(a)! - tiebreakOrder.get(b)!
          || a.localeCompare(b));
        const pick = candidates[0];
        group.push(pick);
        used.add(pick);
      }
      // 凑不满 4 人就不成桌，这些人保留剩余场次，等后面几天轮换。
      if (group.length === 4) groups.push(group);
      else for (const id of group) used.delete(id);
    }
    if (!groups.length) break;

    // 按轮次排：同一轮里各桌时间相同，数组整体保持时间递增。
    const playsPerGroup = groups.map((group) => Math.max(0, Math.min(roundsPerDay, Math.min(...group.map((id) => remaining.get(id)!)))));
    for (let round = 0; round < roundsPerDay; round += 1) {
      groups.forEach((group, groupIndex) => {
        if (round >= playsPerGroup[groupIndex]) return;
        tables.push({ stage, round: (day - 1) * roundsPerDay + round + 1, tableNumber: groupIndex + 1, participantIds: [...group] });
      });
    }
    groups.forEach((group, groupIndex) => {
      const plays = playsPerGroup[groupIndex];
      if (plays <= 0) return;
      for (const id of group) {
        remaining.set(id, remaining.get(id)! - plays);
        for (const other of group) {
          if (other === id) continue;
          const key = pairKey(id, other);
          pairs.set(key, (pairs.get(key) ?? 0) + plays);
        }
      }
    });
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
