import "server-only";

import type { Competition, NagaRating, Person } from "@/domain/types";
import type { PlayerSummary } from "@/server/competition-statistics";
import { listCompetitions } from "@/server/competition-repository";
import { listPeople } from "@/server/person-repository";
import { readCachedLogs, type TenhouLog } from "@/server/tenhou";
import { assessMatchQuality, type PlayerQuality } from "../domain/match-quality";
import { estimateRankByGame, type EstimatedRank } from "../domain/estimated-rank";
import { summarizeNagaMetrics } from "../domain/naga-summary";
// @ts-expect-error The fixed legacy calculator is CommonJS and has no type declarations.
import legacyStatsModule from "../../reference/1st-xrc-29/mrc_stats.js";

type LegacyStatsModule = {
  createStats(): Record<string, number | number[]>;
  addGameStats(stats: Record<string, number | number[]>, log: TenhouLog, seat: number): void;
  addHandStats(allStats: Record<string, Record<string, number | number[]>>, hand: unknown[], seatIdentities: string[]): void;
  finalize(stats: Record<string, number | number[]>): PlayerSummary;
};

export type PersonRatingSummary = {
  model: string;
  rating: number;
  agreementRate: number;
  badMoveRate: number;
  gameCount: number;
};

export type PersonCompetitionSummary = {
  competitionId: string;
  competitionName: string;
  competitionCode: string;
  matchCount: number;
  averageRank: number;
  competitionPoints: number;
};

export type PersonMatchSummary = {
  competitionId: string;
  competitionName: string;
  matchNumber: number;
  playedAt: string;
  rank: number;
  rawPoints: number;
  competitionPoints: number;
  sourceUsername: string;
  tenhouUrl: string;
  nagaUrl: string | null;
  nagaRatings: Record<string, number>;
  nagaQuality: PlayerQuality | null;
  hasCompleteNagaRating: boolean;
};

export type PersonQualitySummary = {
  eligibleCount: number;
  diamondRate: number | null;
  goldRate: number | null;
  horseRate: number | null;
};

export type PersonStatistics = {
  person: Person;
  estimatedRank: EstimatedRank | null;
  summary: PlayerSummary;
  rankCounts: number[];
  ratings: PersonRatingSummary[];
  quality: PersonQualitySummary;
  competitions: PersonCompetitionSummary[];
  matches: PersonMatchSummary[];
};

function calculator() {
  return legacyStatsModule as LegacyStatsModule;
}

function summarizeRatings(ratings: NagaRating[]): PersonRatingSummary[] {
  const byModel = new Map<string, NagaRating[]>();
  for (const rating of ratings) byModel.set(rating.model, [...(byModel.get(rating.model) || []), rating]);
  const preferred = ["ニシキ", "カガシ"];
  return [...byModel.entries()].flatMap(([model, values]) => {
    const summary = summarizeNagaMetrics(values);
    return summary ? [{ model, ...summary }] : [];
  })
    .sort((left, right) => {
      const leftIndex = preferred.indexOf(left.model);
      const rightIndex = preferred.indexOf(right.model);
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex) || left.model.localeCompare(right.model);
    });
}

function estimatedRankForPerson(person: Person, ratings: NagaRating[]): EstimatedRank | null {
  if (person.kind === "human") return estimateRankByGame(ratings);
  return ["mortal", "naga"].includes(person.id) ? "10+" : null;
}

function compareMatchesNewestFirst(left: PersonMatchSummary, right: PersonMatchSummary) {
  const timeDifference = Date.parse(right.playedAt) - Date.parse(left.playedAt);
  if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
  return right.matchNumber - left.matchNumber || left.competitionId.localeCompare(right.competitionId);
}

export function computePersonEstimatedRanks(people: Person[], competitions: Competition[]) {
  const ratings: Record<string, NagaRating[]> = Object.fromEntries(people.map((person) => [person.id, []]));
  for (const competition of competitions) {
    const participantById = new Map(competition.participants.map((participant) => [participant.id, participant]));
    for (const match of competition.matches.filter((item) => item.status === "completed")) {
      for (const rating of match.nagaRatings || []) {
        const personId = participantById.get(rating.participantId)?.personId;
        if (personId && ratings[personId]) ratings[personId].push(rating);
      }
    }
  }
  return Object.fromEntries(people.map((person) => [person.id, estimatedRankForPerson(person, ratings[person.id])])) as Record<string, EstimatedRank | null>;
}

export async function computeAllPersonStatistics(people: Person[], competitions: Competition[]) {
  const stats = calculator();
  const rawStats: Record<string, Record<string, number | number[]>> = Object.fromEntries(people.map((person) => [person.id, stats.createStats()]));
  const histories: Record<string, PersonMatchSummary[]> = Object.fromEntries(people.map((person) => [person.id, []]));
  const ratings: Record<string, NagaRating[]> = Object.fromEntries(people.map((person) => [person.id, []]));
  const completed = competitions.flatMap((competition) => competition.matches.filter((match) => match.status === "completed").map((match) => ({ competition, match })));
  const logs = await readCachedLogs(completed.map(({ match }) => match.tenhouLogId));

  for (const { competition, match } of completed) {
    const log = logs.get(match.tenhouLogId);
    if (!log) throw new Error(`缺少牌谱缓存：${match.tenhouLogId}`);
    const participantById = new Map(competition.participants.map((participant) => [participant.id, participant]));
    const seats = [...match.seats].sort((left, right) => left.seat - right.seat);
    const qualityAssessment = assessMatchQuality(match);
    const identities = seats.map((seat) => participantById.get(seat.participantId)?.personId || `unlinked:${competition.id}:${seat.participantId}`);
    for (const identity of identities) if (!rawStats[identity]) rawStats[identity] = stats.createStats();
    seats.forEach((seat, index) => {
      const personId = identities[index];
      stats.addGameStats(rawStats[personId], log, seat.seat);
      if (!histories[personId]) return;
      histories[personId].push({
        competitionId: competition.id,
        competitionName: competition.name,
        matchNumber: match.matchNumber,
        playedAt: match.playedAt,
        rank: seat.rank,
        rawPoints: seat.rawPoints,
        competitionPoints: seat.competitionPoints,
        sourceUsername: seat.sourceUsername,
        tenhouUrl: match.tenhouUrl,
        nagaUrl: match.nagaUrl,
        nagaRatings: Object.fromEntries((match.nagaRatings || [])
          .filter((rating) => rating.participantId === seat.participantId)
          .map((rating) => [rating.model, rating.rating])),
        nagaQuality: qualityAssessment.players[seat.participantId] || null,
        hasCompleteNagaRating: qualityAssessment.eligiblePlayers.includes(seat.participantId),
      });
    });
    for (const hand of log.log) stats.addHandStats(rawStats, hand, identities);
    for (const rating of match.nagaRatings || []) {
      const personId = participantById.get(rating.participantId)?.personId;
      if (personId && ratings[personId]) ratings[personId].push(rating);
    }
  }

  return Object.fromEntries(people.map((person) => {
    const matches = histories[person.id].sort(compareMatchesNewestFirst);
    const qualityEligible = matches.filter((match) => match.hasCompleteNagaRating);
    const qualityRate = (quality: PlayerQuality) => qualityEligible.length
      ? qualityEligible.filter((match) => match.nagaQuality === quality).length / qualityEligible.length
      : null;
    const competitionGroups = new Map<string, PersonMatchSummary[]>();
    for (const match of matches) competitionGroups.set(match.competitionId, [...(competitionGroups.get(match.competitionId) || []), match]);
    const personStats: PersonStatistics = {
      person,
      estimatedRank: estimatedRankForPerson(person, ratings[person.id]),
      summary: matches.length ? stats.finalize(rawStats[person.id]) : {},
      rankCounts: [1, 2, 3, 4].map((rank) => matches.filter((match) => match.rank === rank).length),
      ratings: summarizeRatings(ratings[person.id]),
      quality: {
        eligibleCount: qualityEligible.length,
        diamondRate: qualityRate("diamond"),
        goldRate: qualityRate("gold"),
        horseRate: qualityRate("horse"),
      },
      competitions: [...competitionGroups.values()].map((values) => ({
        competitionId: values[0].competitionId,
        competitionName: values[0].competitionName,
        competitionCode: competitions.find((competition) => competition.id === values[0].competitionId)?.code || values[0].competitionId,
        matchCount: values.length,
        averageRank: values.reduce((sum, value) => sum + value.rank, 0) / values.length,
        competitionPoints: Number(values.reduce((sum, value) => sum + value.competitionPoints, 0).toFixed(1)),
      })).sort((left, right) => left.competitionCode.localeCompare(right.competitionCode)),
      matches,
    };
    return [person.id, personStats];
  })) as Record<string, PersonStatistics>;
}

export async function loadAllPersonStatistics() {
  const [people, competitions] = await Promise.all([listPeople(), listCompetitions()]);
  return computeAllPersonStatistics(people, competitions);
}

export async function loadPersonEstimatedRanks() {
  const [people, competitions] = await Promise.all([listPeople(), listCompetitions()]);
  return computePersonEstimatedRanks(people, competitions);
}
