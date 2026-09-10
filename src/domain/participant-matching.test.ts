import { describe, expect, it } from "vitest";
import type { Competition, Person } from "./types";
import { inferParticipantId } from "./participant-matching";

const defender: Person = { id: "defender", displayName: "naga-守备型", kind: "ai", color: "#123456", aliases: [], accounts: [] };
const caller: Person = { ...defender, id: "caller", displayName: "NAGA副露型" };
const human: Person = { ...defender, id: "human", displayName: "选手", kind: "human", accounts: [{ platform: "majsoul", username: "雀魂昵称" }] };
function roster(people: Person[]) {
  return { participants: people.map((person, index) => ({
    id: `player-${index + 1}`, personId: person.id, displayName: person.displayName, kind: person.kind,
    color: person.color, usernames: [],
  })) } as unknown as Competition;
}

describe("participant matching", () => {
  it.each(["NAGA", "naga", "NAGAカガシ"])("matches %s to the sole NAGA version in the current roster", (username) => {
    expect(inferParticipantId(roster([defender, human]), username, [defender, caller, human], "tenhou")).toBe("player-1");
  });
  it("uses the person name when a competition display name is different", () => {
    const competition = roster([defender]);
    competition.participants[0].displayName = "守备选手";
    expect(inferParticipantId(competition, "NAGA", [defender], "tenhou")).toBe("player-1");
  });
  it("requires confirmation if multiple NAGA versions are present", () => {
    expect(inferParticipantId(roster([defender, caller]), "NAGA", [defender, caller], "tenhou")).toBeNull();
  });
  it("matches a remembered account across competitions, only on the same platform", () => {
    expect(inferParticipantId(roster([human]), "雀魂昵称", [human], "majsoul")).toBe("player-1");
    expect(inferParticipantId(roster([human]), "雀魂昵称", [human], "tenhou")).toBeNull();
    expect(inferParticipantId(roster([human]), "雀魂昵称", [human], null)).toBeNull();
    expect(inferParticipantId(roster([defender]), "雀魂昵称", [human, defender], "majsoul")).toBeNull();
  });
  it("prefers confirmed platform accounts over an outdated competition username", () => {
    const competition = roster([defender, human]);
    competition.participants[0].usernames = ["雀魂昵称"];
    expect(inferParticipantId(competition, "雀魂昵称", [defender, human], "majsoul")).toBe("player-2");
  });
  it("does not guess when the same account belongs to multiple registered people", () => {
    const versions = [defender, caller].map((person) => ({ ...person, accounts: [{ platform: "tenhou" as const, username: "NAGA" }] }));
    expect(inferParticipantId(roster(versions), "NAGA", versions, "tenhou")).toBeNull();
  });
  it("retains exact competition username matches", () => {
    const competition = roster([human]);
    competition.participants[0].usernames = ["LegacyUsername"];
    expect(inferParticipantId(competition, "LegacyUsername", [human], "tenhou")).toBe("player-1");
  });
});
