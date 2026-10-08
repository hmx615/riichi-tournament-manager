import type { Competition, CompetitionFormat, IndividualCompetitionSettings } from "./types";

/** 默认按启明杯口径：初赛 4 周日常周 + 3 周淘汰周（每周淘汰末 4 人），决赛 4 人打 12 个半庄。 */
export const defaultIndividualPreliminary = {
  regularWeeks: 4,
  eliminationWeeks: 3,
  matchesPerPlayerPerWeek: 4,
  eliminationCountPerWeek: 4,
  finalistCount: 4,
  legalWeekdays: [0, 3] as [number, number],
  legalTimes: ["20:00", "21:30"] as [string, string],
};

export const defaultIndividualCompetitionSettings: IndividualCompetitionSettings = {
  preliminary: { ...defaultIndividualPreliminary },
  final: { matchCountPerPlayer: 12 },
  pairingMode: "balanced_opponents",
};

type LegacyIndividualSettings = {
  stages?: {
    preliminary?: { matchCountPerPlayer?: number; advancingPlayerCount?: number };
    semifinal?: { matchCountPerPlayer?: number; advancingPlayerCount?: number };
    final?: { matchCountPerPlayer?: number };
  };
  semifinalAdvancingPlayerCount?: number;
};

function positiveInteger(value: unknown, fallback: number) {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback;
}

/**
 * 把文档里存的设置读成新结构。
 * 旧文档是「初赛/半决赛/决赛」三阶段，读出来换算成"初赛只有日常周"的等价形态，保证老数据不炸。
 */
export function normalizeIndividualSettings(raw: unknown): IndividualCompetitionSettings {
  const stored = (raw ?? {}) as Partial<IndividualCompetitionSettings> & LegacyIndividualSettings;
  if (stored.preliminary && typeof stored.preliminary === "object") {
    const preliminary = stored.preliminary;
    return {
      preliminary: {
        regularWeeks: positiveInteger(preliminary.regularWeeks, defaultIndividualPreliminary.regularWeeks),
        eliminationWeeks: positiveInteger(preliminary.eliminationWeeks, defaultIndividualPreliminary.eliminationWeeks),
        matchesPerPlayerPerWeek: positiveInteger(preliminary.matchesPerPlayerPerWeek, defaultIndividualPreliminary.matchesPerPlayerPerWeek),
        eliminationCountPerWeek: positiveInteger(preliminary.eliminationCountPerWeek, defaultIndividualPreliminary.eliminationCountPerWeek),
        finalistCount: positiveInteger(preliminary.finalistCount, defaultIndividualPreliminary.finalistCount),
        legalWeekdays: preliminary.legalWeekdays ?? defaultIndividualPreliminary.legalWeekdays,
        legalTimes: preliminary.legalTimes ?? defaultIndividualPreliminary.legalTimes,
        ...(preliminary.startDate ? { startDate: preliminary.startDate } : {}),
      },
      final: { matchCountPerPlayer: positiveInteger(stored.final?.matchCountPerPlayer, defaultIndividualCompetitionSettings.final.matchCountPerPlayer) },
      pairingMode: "balanced_opponents",
    };
  }
  const legacy = stored.stages ?? {};
  return {
    preliminary: {
      regularWeeks: 1,
      eliminationWeeks: 0,
      matchesPerPlayerPerWeek: positiveInteger(legacy.preliminary?.matchCountPerPlayer, 0),
      eliminationCountPerWeek: 0,
      finalistCount: positiveInteger(legacy.semifinal?.advancingPlayerCount ?? stored.semifinalAdvancingPlayerCount, 0),
    },
    final: { matchCountPerPlayer: positiveInteger(legacy.final?.matchCountPerPlayer, 0) },
    pairingMode: "balanced_opponents",
  };
}

export function competitionFormat(competition: Pick<Competition, "format">): CompetitionFormat {
  return competition.format || "four_player";
}

export function isIndividualCompetition(competition: Pick<Competition, "format">) {
  return competitionFormat(competition) === "individual";
}

export function isMatchPoolCompetition(competition: Pick<Competition, "autoIncludePersonTags">) {
  return competition.autoIncludePersonTags !== undefined;
}

export function individualSettingsFor(competition: { format?: CompetitionFormat; individualSettings?: unknown }): IndividualCompetitionSettings | null {
  if (!isIndividualCompetition(competition)) return null;
  return competition.individualSettings ? normalizeIndividualSettings(competition.individualSettings) : defaultIndividualCompetitionSettings;
}
