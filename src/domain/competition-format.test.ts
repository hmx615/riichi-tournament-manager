import { describe, expect, it } from "vitest";
import { competitionFormat, individualSettingsFor, isIndividualCompetition, isMatchPoolCompetition } from "./competition-format";

describe("competition format", () => {
  it("keeps legacy competitions as four-player competitions", () => {
    const legacy = {};
    expect(competitionFormat(legacy)).toBe("four_player");
    expect(isIndividualCompetition(legacy)).toBe(false);
    expect(individualSettingsFor(legacy)).toBeNull();
  });

  it("recognizes an individual competition and supplies the weekly defaults", () => {
    const competition = { format: "individual" as const };
    expect(competitionFormat(competition)).toBe("individual");
    expect(isIndividualCompetition(competition)).toBe(true);
    const settings = individualSettingsFor(competition)!;
    expect(settings.preliminary.regularWeeks).toBe(4);
    expect(settings.preliminary.eliminationWeeks).toBe(3);
    expect(settings.preliminary.eliminationCountPerWeek).toBe(4);
    expect(settings.final.matchCountPerPlayer).toBe(12);
  });

  it("reads legacy three-stage settings without crashing", () => {
    const legacy = {
      format: "individual" as const,
      individualSettings: {
        stages: {
          preliminary: { matchCountPerPlayer: 20, advancingPlayerCount: 8 },
          semifinal: { matchCountPerPlayer: 8, advancingPlayerCount: 4 },
          final: { matchCountPerPlayer: 8 },
        },
        pairingMode: "balanced_opponents" as const,
      },
    };
    const settings = individualSettingsFor(legacy)!;
    expect(settings.preliminary.matchesPerPlayerPerWeek).toBe(20);
    expect(settings.final.matchCountPerPlayer).toBe(8);
  });

  it("recognizes any competition with an automatic tag rule as a match pool", () => {
    expect(isMatchPoolCompetition({ autoIncludePersonTags: [] })).toBe(true);
    expect(isMatchPoolCompetition({})).toBe(false);
  });
});
