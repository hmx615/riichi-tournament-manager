import type { Competition, IndividualScheduleTable, MatchRecord } from "./types";

export function scheduledMatch(competition: Competition, table: IndividualScheduleTable) {
  return competition.matches.find((match) => match.scheduleId ? match.scheduleId === table.id : (
    match.stage === table.stage && match.round === table.round && match.tableNumber === table.tableNumber
  ));
}

export function entrySchedule(competition: Competition, scheduleId: string) {
  if (competition.format !== "individual") return undefined;
  const table = competition.individualSchedule?.find((item) => item.id === scheduleId);
  if (!table) throw new Error("请从具体赛程卡片选择要录入的对局");
  if (table.status === "cancelled") throw new Error("该桌赛程已取消");
  return table;
}

export function requireOpenTable(competition: Competition, table: IndividualScheduleTable) {
  if (table.status === "completed" || scheduledMatch(competition, table)) throw new Error("该桌已经录入牌谱，请刷新赛程");
}

export function completeScheduledMatch(competition: Competition, match: MatchRecord) {
  const table = entrySchedule(competition, match.scheduleId || "");
  if (!table) return;
  requireOpenTable(competition, table);
  const ids = match.seats.map((seat) => seat.participantId);
  if (ids.length !== 4 || new Set(ids).size !== 4 || table.participantIds.length !== 4 || ids.some((id) => !table.participantIds.includes(id))) {
    throw new Error("牌谱四名选手必须与本桌赛程一致");
  }
  match.stage = table.stage;
  match.round = table.round;
  match.tableNumber = table.tableNumber;
  table.status = "completed";
  table.matchNumber = match.matchNumber;
}
