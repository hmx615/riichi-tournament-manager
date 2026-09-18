import "server-only";

import type { Competition } from "@/domain/types";
import {
  INITIAL_SHANTEN_BASELINE,
  luckSamplesFromRound,
  summarizeLuck,
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
 * 每个人的近况运势。
 *
 * 只处理"最近 20 半庄"覆盖到的牌谱（所有人窗口的并集），并且每份牌谱只解析一次：
 * 一局解出 4 个座位的样本，再按人聚合，避免逐个人重复解析。
 */
export async function computePersonLuck(windowMatches: number = LUCK_WINDOW_MATCHES): Promise<Record<string, LuckReport>> {
  const [people, competitions] = await Promise.all([listPeople(), listCompetitions()]);
  const matches = collectCompletedMatches(competitions);

  // 1. 每个人取最近 N 场，得到窗口内的牌谱集合。
  const windowLogIds = new Map<string, Set<string>>(people.map((person) => [person.id, new Set<string>()]));
  const windowMatchCount = new Map<string, number>(people.map((person) => [person.id, 0]));
  for (const person of people) {
    const mine = matches
      .filter((match) => match.personBySeat.includes(person.id))
      .sort((left, right) => Date.parse(right.playedAt) - Date.parse(left.playedAt) || right.matchNumber - left.matchNumber);
    for (const match of mine.slice(0, Math.max(1, windowMatches))) {
      windowLogIds.get(person.id)?.add(match.logId);
      windowMatchCount.set(person.id, (windowMatchCount.get(person.id) ?? 0) + 1);
    }
  }

  const logMeta = new Map(matches.map((match) => [match.logId, match]));
  const targetLogIds = [...new Set([...windowLogIds.values()].flatMap((ids) => [...ids]))];
  const logs = await readCachedLogs(targetLogIds);

  const calculator = legacyStats();
  const samplesByPerson = new Map<string, LuckSample[]>(people.map((person) => [person.id, []]));
  // 起手向听只累计两个数，直接调用统计脚本里的向听函数，
  // 比为一手牌跑完整的 addHandStats 快得多（这是本模块最贵的一步）。
  const shantenSum = new Map<string, number>(people.map((person) => [person.id, 0]));
  const shantenHands = new Map<string, number>(people.map((person) => [person.id, 0]));
  const roundsByPerson = new Map<string, number>(people.map((person) => [person.id, 0]));

  // 2. 逐局生成样本并累计起手向听；窗口外的人物用一次性对象承接，避免污染统计。
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
          if (!inWindow(personId)) continue;
          samplesByPerson.get(personId)?.push(sample);
        }
      }
      for (let seat = 0; seat < 4; seat += 1) {
        const personId = meta.personBySeat[seat];
        if (!inWindow(personId)) continue;
        const initial = round[4 + seat * 3];
        if (!Array.isArray(initial) || initial.length !== 13) continue;
        shantenSum.set(personId, (shantenSum.get(personId) ?? 0) + calculator.initialShanten(initial.map(Number)));
        shantenHands.set(personId, (shantenHands.get(personId) ?? 0) + 1);
      }
    }
    for (const personId of new Set(meta.personBySeat)) {
      if (!inWindow(personId)) continue;
      roundsByPerson.set(personId, (roundsByPerson.get(personId) ?? 0) + rounds);
    }
  }

  return Object.fromEntries(people.map((person) => {
    const hands = shantenHands.get(person.id) ?? 0;
    const mean = hands > 0 ? (shantenSum.get(person.id) ?? 0) / hands : 0;
    return [person.id, summarizeLuck(samplesByPerson.get(person.id) ?? [], {
      windowMatches: windowMatchCount.get(person.id) ?? 0,
      windowRounds: roundsByPerson.get(person.id) ?? 0,
      initialShantenMean: mean,
      initialShantenHands: hands,
    })];
  }));
}

export async function loadPersonLuck() {
  // 运势要重建手牌、算待牌，属于重计算：按数据版本缓存成独立快照，和全量统计分开。
  return cachedSnapshot("luck-v1", () => computePersonLuck());
}
