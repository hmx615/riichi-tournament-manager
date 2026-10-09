import type { Competition, IndividualScheduleTable } from "./types";
import { individualWeekOf } from "./individual-standings";
import { negotiationFor } from "./schedule-negotiation";

export type NegotiationResponse = "accepted" | "declined" | "pending";

/** 一名选手在某一场上的回应状态。 */
export function tableResponseFor(table: IndividualScheduleTable, participantId: string): NegotiationResponse {
  const vote = negotiationFor(table).confirmations.find((item) => item.participantId === participantId);
  return vote?.status ?? "pending";
}

/** 一场（一桌）里每个人的回应，以及整桌是否都回应了。 */
export type TableResponseSummary = {
  table: IndividualScheduleTable;
  responses: Array<{ participantId: string; status: NegotiationResponse }>;
  responded: number;
  total: number;
  declined: number;
  /** 整桌都回应且没人拒绝。 */
  allConfirmed: boolean;
};

export function tableResponseSummary(table: IndividualScheduleTable): TableResponseSummary {
  const responses = table.participantIds.map((participantId) => ({
    participantId,
    status: tableResponseFor(table, participantId),
  }));
  const responded = responses.filter((item) => item.status !== "pending").length;
  const declined = responses.filter((item) => item.status === "declined").length;
  return {
    table,
    responses,
    responded,
    total: responses.length,
    declined,
    allConfirmed: responded === responses.length && declined === 0 && responses.length > 0,
  };
}

/** 北京时间日历日，用来把同一天的两轮并成一个抽屉。 */
export function beijingDayOf(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

export type NegotiationDayGroup = {
  /** 北京时间日期，如 2026-10-11。 */
  day: string;
  tables: TableResponseSummary[];
  rounds: number[];
  /** 这一天的开赛与结束时间（北京时间显示文案由页面负责）。 */
  startsAt: number;
  /** 人数次口径：该天所有桌子里「已回应 / 总数」。同一人两轮算两次。 */
  responded: number;
  total: number;
  /** 这一天还没回应的选手（去重）。 */
  waiting: string[];
  /** 按场次拆开的待回应名单：同一人两场都可能欠，要标出是哪一场。 */
  waitingByRound: Array<{ round: number; time: string; participantIds: string[] }>;
  declined: string[];
  /** 整天都确认完了。 */
  complete: boolean;
};

/** 按北京日历日把赛程分组，供管理员一眼看完确认进度。 */
export function negotiationDayGroups(competition: Competition): NegotiationDayGroup[] {
  const groups = new Map<string, NegotiationDayGroup>();
  for (const table of competition.individualSchedule ?? []) {
    if (table.status === "cancelled") continue;
    const day = beijingDayOf(table.scheduledAt);
    if (!day) continue;
    const summary = tableResponseSummary(table);
    const existing = groups.get(day);
    if (existing) {
      existing.tables.push(summary);
      existing.startsAt = Math.min(existing.startsAt, Date.parse(table.scheduledAt));
      existing.responded += summary.responded;
      existing.total += summary.total;
      if (!existing.rounds.includes(table.round)) existing.rounds.push(table.round);
    } else {
      groups.set(day, {
        day,
        tables: [summary],
        rounds: [table.round],
        startsAt: Date.parse(table.scheduledAt),
        responded: summary.responded,
        total: summary.total,
        waiting: [],
        waitingByRound: [],
        declined: [],
        complete: false,
      });
    }
  }
  const days = [...groups.values()].sort((left, right) => left.startsAt - right.startsAt);
  for (const day of days) {
    day.rounds.sort((left, right) => left - right);
    // 先按未确认人数降序（四个都没回的排最前），再按轮次、桌号。
    day.tables.sort((left, right) => {
      const leftWaiting = left.responses.filter((item) => item.status === "pending").length;
      const rightWaiting = right.responses.filter((item) => item.status === "pending").length;
      return rightWaiting - leftWaiting || left.table.round - right.table.round || left.table.tableNumber - right.table.tableNumber;
    });
    const waiting = new Set<string>();
    const declined = new Set<string>();
    for (const summary of day.tables) {
      for (const item of summary.responses) {
        if (item.status === "pending") waiting.add(item.participantId);
        else if (item.status === "declined") declined.add(item.participantId);
      }
    }
    day.waiting = [...waiting];
    day.declined = [...declined];
    // 按场次拆开：一个选手可能只欠其中一场，名字后面要标出是哪一场。
    const byRound = new Map<number, { time: string; participantIds: string[] }>();
    for (const summary of day.tables) {
      const entry = byRound.get(summary.table.round) ?? { time: summary.table.scheduledAt, participantIds: [] };
      for (const item of summary.responses) if (item.status === "pending") entry.participantIds.push(item.participantId);
      byRound.set(summary.table.round, entry);
    }
    day.waitingByRound = [...byRound.entries()]
      .map(([round, entry]) => ({ round, time: entry.time, participantIds: [...new Set(entry.participantIds)] }))
      .sort((left, right) => left.round - right.round);
    day.complete = day.responded === day.total && day.total > 0;
  }
  return days;
}

/** 全赛程里每个人还欠几场回应，以及具体是哪几场。 */
export type ParticipantPendingSummary = {
  participantId: string;
  total: number;
  responded: number;
  pending: number;
  pendingTables: Array<{ tableId: string; week: number; round: number; tableNumber: number; scheduledAt: string }>;
  declinedTables: Array<{ tableId: string; week: number; round: number; tableNumber: number; scheduledAt: string }>;
};

export function participantPendingSummaries(competition: Competition): ParticipantPendingSummary[] {
  const byId = new Map<string, ParticipantPendingSummary>();
  for (const participant of competition.participants) {
    byId.set(participant.id, { participantId: participant.id, total: 0, responded: 0, pending: 0, pendingTables: [], declinedTables: [] });
  }
  for (const table of competition.individualSchedule ?? []) {
    if (table.status === "cancelled") continue;
    for (const item of tableResponseSummary(table).responses) {
      const row = byId.get(item.participantId);
      if (!row) continue;
      const location = { tableId: table.id, week: individualWeekOf(table), round: table.round, tableNumber: table.tableNumber, scheduledAt: table.scheduledAt };
      row.total += 1;
      if (item.status === "pending") { row.pending += 1; row.pendingTables.push(location); }
      else {
        row.responded += 1;
        if (item.status === "declined") row.declinedTables.push(location);
      }
    }
  }
  return [...byId.values()].sort((left, right) => right.pending - left.pending || right.declinedTables.length - left.declinedTables.length);
}
