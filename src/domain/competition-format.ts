import type { Competition, CompetitionFormat, IndividualCompetitionSettings } from "./types";

export const defaultIndividualCompetitionSettings: IndividualCompetitionSettings = {
  stages: {
    preliminary: { matchCountPerPlayer: 0 },
    semifinal: { matchCountPerPlayer: 0 },
    final: { matchCountPerPlayer: 0 },
  },
  pairingMode: "balanced_opponents",
};

export function competitionFormat(competition: Pick<Competition, "format">): CompetitionFormat {
  return competition.format || "four_player";
}

export function isIndividualCompetition(competition: Pick<Competition, "format">) {
  return competitionFormat(competition) === "individual";
}

export function individualSettingsFor(competition: Pick<Competition, "format" | "individualSettings">): IndividualCompetitionSettings | null {
  if (!isIndividualCompetition(competition)) return null;
  return competition.individualSettings || defaultIndividualCompetitionSettings;
}
