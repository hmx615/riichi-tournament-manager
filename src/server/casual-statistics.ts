import "server-only";

import type { Competition, MatchRecord, NagaRating, Participant, Person } from "@/domain/types";
import { casualInitialPoints, casualRankPoints, type CasualRecord } from "@/domain/casual-record";
import { calculateCompetitionPoints } from "@/domain/scoring";
import { casualDataVersion, listCasualRecords, readCasualLogs } from "@/server/casual-repository";
import { listPeople } from "@/server/person-repository";
import { computePersonStatistics, withCurrentPersonProfiles, type PersonStatistics } from "@/server/person-statistics";
import { cachedSnapshot } from "@/server/stats-snapshot";
import type { TenhouLog } from "@/server/tenhou";
import { pickCompareMetrics } from "@/domain/metric-compare";

/**
 * 散排数据用同一套统计口径单独计算，但绝不进入比赛统计：
 * 玩家自选牌谱存在选择偏差，所以只作为参考样本存在。
 */
export const CASUAL_COMPETITION_ID = "casual-rank";
export const CASUAL_COMPETITION_NAME = "散排";

function participantForPerson(person: Person): Participant {
  return {
    id: `person-${person.id}`,
    personId: person.id,
    displayName: person.displayName,
    kind: person.kind,
    color: person.color,
    usernames: [person.displayName, ...person.aliases, ...person.accounts.map((account) => account.username)],
  };
}

export function casualGuestParticipantId(recordId: string, seat: number) {
  return `guest-${recordId}-${seat}`;
}

/** 与统计时的场次编号保持一致：按对局时间、再按录入时间排序。 */
export function orderedCasualRecords(records: CasualRecord[]) {
  return [...records].sort((left, right) => left.playedAt.localeCompare(right.playedAt) || left.createdAt.localeCompare(right.createdAt));
}

/** 解析牌谱时的身份匹配范围由调用方传入；普通选手只传本人。 */
export function casualMatchingCompetition(people: Person[]): Competition {
  return {
    id: CASUAL_COMPETITION_ID,
    name: CASUAL_COMPETITION_NAME,
    code: "CASUAL",
    status: "active",
    plannedMatchCount: 0,
    initialPoints: casualInitialPoints,
    rankPoints: casualRankPoints,
    participants: people.map(participantForPerson),
    matches: [],
  };
}

function guestParticipant(record: CasualRecord, seatIndex: number): Participant {
  const seat = record.seats[seatIndex];
  return {
    id: casualGuestParticipantId(record.id, seat.seat),
    displayName: seat.guestName?.trim() || "排位对手",
    kind: "human",
    color: "#8b929a",
    usernames: [],
  };
}

function casualMatchRecord(record: CasualRecord, matchNumber: number, participants: Map<string, Participant>): MatchRecord {
  const rawPoints = record.seats.map((seat) => seat.rawPoints);
  const points = calculateCompetitionPoints(rawPoints, casualInitialPoints, casualRankPoints);
  const nagaRatings: NagaRating[] = record.nagaRatings.flatMap((rating) => {
    const seat = record.seats[rating.seat];
    if (!seat) return [];
    const participant = participants.get(seat.personId ? `person-${seat.personId}` : casualGuestParticipantId(record.id, seat.seat));
    if (!participant) return [];
    return [{
      participantId: participant.id,
      model: rating.model,
      rating: rating.rating,
      agreementRate: rating.agreementRate,
      badMoveRate: rating.badMoveRate,
      decisionCount: rating.decisionCount,
    }];
  });
  return {
    id: `casual-${record.id}`,
    matchNumber,
    status: "completed",
    playedAt: record.playedAt,
    tenhouLogId: record.tenhouLogId,
    contentFingerprint: record.contentFingerprint,
    tenhouUrl: record.tenhouUrl,
    sourceType: record.sourceType === "majsoul" ? "majsoul" : "tenhou",
    nagaUrl: record.nagaUrl,
    nagaReportId: record.nagaReportId,
    nagaRatings,
    seats: record.seats.map((seat) => ({
      seat: seat.seat,
      participantId: seat.personId ? `person-${seat.personId}` : casualGuestParticipantId(record.id, seat.seat),
      sourceUsername: seat.sourceUsername,
      rawPoints: seat.rawPoints,
      rank: seat.rank,
      competitionPoints: points[seat.seat],
      assignmentSource: "manual",
    })),
    reviewNote: null,
  };
}

/** 把散排记录组装成一个「虚拟比赛」，供统计核心直接复用。 */
export function casualStatisticsCompetition(people: Person[], records: CasualRecord[]): Competition {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const participants = new Map<string, Participant>();
  for (const person of people) {
    if (records.some((record) => record.seats.some((seat) => seat.personId === person.id))) {
      participants.set(`person-${person.id}`, participantForPerson(person));
    }
  }
  const ordered = orderedCasualRecords(records);
  const matches = ordered.map((record, index) => {
    for (const seat of record.seats) {
      if (!seat.personId) continue;
      const person = peopleById.get(seat.personId);
      if (person) participants.set(`person-${person.id}`, participantForPerson(person));
    }
    for (const seat of record.seats) {
      if (!seat.personId) participants.set(casualGuestParticipantId(record.id, seat.seat), guestParticipant(record, seat.seat));
    }
    return casualMatchRecord(record, index + 1, participants);
  });
  return {
    id: CASUAL_COMPETITION_ID,
    name: CASUAL_COMPETITION_NAME,
    code: "CASUAL",
    status: "active",
    plannedMatchCount: records.length,
    initialPoints: casualInitialPoints,
    rankPoints: casualRankPoints,
    participants: [...participants.values()],
    matches,
  };
}

async function computeCasualStatistics(people: Person[], records: CasualRecord[], logs: Map<string, TenhouLog>) {
  // 牌谱原文缺失的记录先跳过，避免一条坏数据让整页报错。
  const usable = records.filter((record) => logs.has(record.tenhouLogId));
  if (!usable.length) return null;
  return computePersonStatistics(people, [casualStatisticsCompetition(people, usable)], logs);
}

export async function loadCasualStatistics() {
  const [people, records] = await Promise.all([listPeople(), listCasualRecords()]);
  const statistics = await cachedSnapshot(
    "casual-statistics-v1",
    async () => computeCasualStatistics(people, records, await readCasualLogs(records.map((record) => record.tenhouLogId))),
    casualDataVersion,
  );
  return statistics ? withCurrentPersonProfiles(statistics, people) : {};
}

export async function loadCasualStatisticsForPerson(personId: string) {
  const [statistics, people] = await Promise.all([loadCasualStatistics(), listPeople()]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const entries = Object.values(statistics).filter((item) => item.matches.length > 0);
  const peopleOptions = entries.map((item) => ({
    id: item.person.id,
    displayName: item.person.displayName,
    color: item.person.color,
    matchCount: item.matches.length,
  })).sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN"));
  const summaries = Object.fromEntries(entries.map((item) => [item.person.id, pickCompareMetrics(item.summary)]));
  return { statistics: statistics[personId] ?? null, people: peopleOptions, peopleById, summaries };
}
