import "server-only";

import type { Competition } from "@/domain/types";
import {
  INITIAL_SHANTEN_BASELINE,
  luckSamplesFromRound,
  summarizeLuck,
  type LuckViews,
  type LuckReport,
  type LuckSample,
} from "@/domain/luck";
import { listCompetitions } from "@/server/competition-repository";
import { listPeople } from "@/server/person-repository";
import { cachedSnapshot } from "@/server/stats-snapshot";
import { readCachedLogs } from "@/server/tenhou";
// @ts-expect-error 固定的历史统计脚本是 CommonJS，没有类型声明。
import legacyStatsModule from "../../reference/1st-xrc-29/mrc_stats.js";

type Stats = Record<string, number | number[]>;

type LegacyStatsModule = {
  createStats(): Stats;
  /** 13 张起手牌的标准向听数。 */
  initialShanten(tiles: number[]): number;
};

/** 运势窗口：最近多少个半庄（不满就按现有全部算）。 */
export const LUCK_WINDOW_MATCHES = 20;

type CompletedMatch = {
  competition: Competition;
  logId: string;
  playedAt: string;
  matchNumber: number;
  /** 按座次排列的人物 ID，未关联人物时为空字符串。 */
  personBySeat: string[];
};

export type PersonLuckViews = LuckViews;

function legacyStats(): LegacyStatsModule {
  return legacyStatsModule as LegacyStatsModule;
}

function collectCompletedMatches(competitions: Competition[]): CompletedMatch[] {
  return competitions.flatMap((competition) => {
    const participantById = new Map(competition.participants.map((participant) => [participant.id, participant]));
    return competition.matches
      .filter((match) => match.status === "completed")
      .map((match) => {
        const personBySeat = Array<string>(4).fill("");
        for (const seat of match.seats) personBySeat[seat.seat] = participantById.get(seat.participantId)?.personId ?? "";
        return {
          competition,
          logId: match.tenhouLogId,
          playedAt: match.playedAt,
          matchNumber: match.matchNumber,
          personBySeat,
        } satisfies CompletedMatch;
      });
  });
}

/**
 * 每个人的运势：近期（最近 20 半庄）与长期（全部牌谱）两套。
 *
 * 每份牌谱只解析一次，一局解出 4 个座位的样本；样本带着来源牌谱 ID，
 * 近期视图直接按窗口过滤，不必把重计算跑两遍。
 */
export async function computePersonLuck(windowMatches: number = LUCK_WINDOW_MATCHES): Promise<Record<string, PersonLuckViews>> {
  const [people, competitions] = await Promise.all([listPeople(), listCompetitions()]);
  const matches = collectCompletedMatches(competitions);

  // 1. 每个人取最近 N 场，得到窗口内的牌谱集合；全部牌谱用于长期视图。
  const windowLogIds = new Map<string, Set<string>>(people.map((person) => [person.id, new Set<string>()]));
  const windowMatchCount = new Map<string, number>(people.map((person) => [person.id, 0]));
  const totalMatchCount = new Map<string, number>(people.map((person) => [person.id, 0]));
  for (const person of people) {
    const mine = matches
      .filter((match) => match.personBySeat.includes(person.id))
      .sort((left, right) => Date.parse(right.playedAt) - Date.parse(left.playedAt) || right.matchNumber - left.matchNumber);
    totalMatchCount.set(person.id, mine.length);
    for (const match of mine.slice(0, Math.max(1, windowMatches))) {
      windowLogIds.get(person.id)?.add(match.logId);
      windowMatchCount.set(person.id, (windowMatchCount.get(person.id) ?? 0) + 1);
    }
  }

  const logMeta = new Map(matches.map((match) => [match.logId, match]));
  const targetLogIds = [...new Set(matches.map((match) => match.logId))];
  const logs = await readCachedLogs(targetLogIds);

  const calculator = legacyStats();
  const samplesByPerson = new Map<string, Array<{ logId: string; sample: LuckSample }>>(people.map((person) => [person.id, []]));
  // 起手向听只累计两个数，直接调用统计脚本里的向听函数，
  // 比为一手牌跑完整的 addHandStats 快得多（这是本模块最贵的一步）。
  const shanten = new Map<string, { allSum: number; allHands: number; windowSum: number; windowHands: number }>(
    people.map((person) => [person.id, { allSum: 0, allHands: 0, windowSum: 0, windowHands: 0 }]),
  );
  const roundsByPerson = new Map<string, { all: number; window: number }>(people.map((person) => [person.id, { all: 0, window: 0 }]));

  // 2. 逐局生成样本并累计起手向听。
  for (const logId of targetLogIds) {
    const meta = logMeta.get(logId);
    const log = logs.get(logId);
    if (!meta || !log) continue;
    const inWindow = (personId: string) => Boolean(personId) && (windowLogIds.get(personId)?.has(logId) ?? false);
    let rounds = 0;
    for (const round of log.log) {
      if (!Array.isArray(round) || round.length < 16) continue;
      rounds += 1;
      const samples = luckSamplesFromRound(round);
      if (samples) {
        for (const sample of samples) {
          const personId = meta.personBySeat[sample.seat];
          if (!personId || !samplesByPerson.has(personId)) continue;
          samplesByPerson.get(personId)?.push({ logId, sample });
        }
      }
      for (let seat = 0; seat < 4; seat += 1) {
        const personId = meta.personBySeat[seat];
        const record = shanten.get(personId);
        if (!record) continue;
        const initial = round[4 + seat * 3];
        if (!Array.isArray(initial) || initial.length !== 13) continue;
        const value = calculator.initialShanten(initial.map(Number));
        record.allSum += value;
        record.allHands += 1;
        if (inWindow(personId)) {
          record.windowSum += value;
          record.windowHands += 1;
        }
      }
    }
    for (const personId of new Set(meta.personBySeat)) {
      const record = roundsByPerson.get(personId);
      if (!record) continue;
      record.all += rounds;
      if (inWindow(personId)) record.window += rounds;
    }
  }

  return Object.fromEntries(people.map((person) => {
    const entries = samplesByPerson.get(person.id) ?? [];
    const record = shanten.get(person.id) ?? { allSum: 0, allHands: 0, windowSum: 0, windowHands: 0 };
    const counts = roundsByPerson.get(person.id) ?? { all: 0, window: 0 };
    const window = windowLogIds.get(person.id) ?? new Set<string>();
    const recentSamples = entries.filter((entry) => window.has(entry.logId)).map((entry) => entry.sample);
    return [person.id, {
      recent: summarizeLuck(recentSamples, {
        windowMatches: windowMatchCount.get(person.id) ?? 0,
        windowRounds: counts.window,
        initialShantenMean: record.windowHands > 0 ? record.windowSum / record.windowHands : 0,
        initialShantenHands: record.windowHands,
      }),
      allTime: summarizeLuck(entries.map((entry) => entry.sample), {
        windowMatches: totalMatchCount.get(person.id) ?? 0,
        windowRounds: counts.all,
        initialShantenMean: record.allHands > 0 ? record.allSum / record.allHands : 0,
        initialShantenHands: record.allHands,
      }),
    } satisfies PersonLuckViews];
  }));
}

export async function loadPersonLuck() {
  // 运势要重建手牌、算待牌，属于重计算：按数据版本缓存成独立快照，和全量统计分开。
  return cachedSnapshot("luck-v1", () => computePersonLuck());
}
