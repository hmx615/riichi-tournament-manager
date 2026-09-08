import { describe, expect, it } from "vitest";
import { competitionFormat, individualSettingsFor, isIndividualCompetition } from "./competition-format";

describe("competition format", () => {
  it("keeps legacy competitions as four-player competitions", () => {
    const legacy = {};
    expect(competitionFormat(legacy)).toBe("four_player");
    expect(isIndividualCompetition(legacy)).toBe(false);
    expect(individualSettingsFor(legacy)).toBeNull();
  });

  it("recognizes an individual competition and supplies safe stage defaults", () => {
    const competition = { format: "individual" as const };
    expect(competitionFormat(competition)).toBe("individual");
    expect(isIndividualCompetition(competition)).toBe(true);
    expect(individualSettingsFor(competition)?.stages.semifinal.matchCountPerPlayer).toBe(0);
  });
});
