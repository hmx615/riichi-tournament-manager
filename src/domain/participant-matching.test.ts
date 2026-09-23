import { describe, expect, it } from "vitest";
import type { Competition, Person } from "./types";
import { inferParticipantId, participantCandidates, resolveTableParticipants } from "./participant-matching";

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

const hmx: Person = {
  id: "hmx", displayName: "何明轩", kind: "human", color: "#111111", aliases: [],
  accounts: [
    { platform: "tenhou", username: "東海大黄魚" },
    { platform: "tenhou", username: "猫妥" },
    { platform: "tenhou", username: "風蛍月" },
    { platform: "majsoul", username: "Traaaaa" },
  ],
};
const zhao: Person = {
  id: "Zhao_dehua", displayName: "赵得華", kind: "human", color: "#222222", aliases: [],
  accounts: [{ platform: "tenhou", username: "東海大黄魚" }, { platform: "majsoul", username: "陈黑水" }],
  sharedAccountPriority: ["東海大黄魚"],
};
const xiaop: Person = {
  id: "xiaop", displayName: "彭虹清", kind: "human", color: "#333333", aliases: [],
  accounts: [
    { platform: "tenhou", username: "風蛍月" },
    { platform: "tenhou", username: "猫妥" },
    { platform: "tenhou", username: "こくらあさひ" },
    { platform: "majsoul", username: "越山逐月" },
  ],
  sharedAccountPriority: ["風蛍月"],
};
const humiao: Person = { ...hmx, id: "humiao", displayName: "王聿阳", accounts: [{ platform: "tenhou", username: "humiao" }] };
const shiqiang: Person = { ...hmx, id: "士强", displayName: "赵士强", accounts: [{ platform: "tenhou", username: "マジエロ茉子" }] };
const nagaGuard: Person = { ...hmx, id: "NAGA守备型", displayName: "NAGA守备型", kind: "ai", accounts: [{ platform: "tenhou", username: "◯NAGA19" }] };
const sharedPeople = [hmx, zhao, xiaop, humiao, shiqiang, nagaGuard];

describe("table level participant matching", () => {
  it("keeps shared accounts unresolved when only the account itself is present", () => {
    expect(participantCandidates(roster(sharedPeople), "東海大黄魚", sharedPeople, "tenhou")).toEqual(["player-1", "player-2"]);
  });

  it("resolves 東海大黄魚 to 赵得華 when 何明轩 is pinned by another seat, via the scheduled table roster", () => {
    const table = roster([hmx, zhao, nagaGuard, humiao]);
    const matches = resolveTableParticipants(table, ["風蛍月", "東海大黄魚", "◯NAGA19", "humiao"], sharedPeople, "tenhou");
    expect(matches.map((match) => match.participantId)).toEqual(["player-1", "player-2", "player-3", "player-4"]);
    expect(matches[0].resolvedByTable).toBe(false);
    expect(matches[1].resolvedByTable).toBe(true);
  });

  it("resolves 风蛍月 to 何明轩 and 東海大黄魚 to 赵得華 once 彭虹清 is pinned in the same table", () => {
    const matches = resolveTableParticipants(roster(sharedPeople), ["こくらあさひ", "東海大黄魚", "風蛍月", "humiao"], sharedPeople, "tenhou");
    expect(matches.map((match) => match.participantId)).toEqual(["player-3", "player-2", "player-1", "player-4"]);
    expect(matches[2].resolvedByTable).toBe(true);
  });

  it("leaves both shared accounts for manual confirmation when nothing else pins a seat", () => {
    const matches = resolveTableParticipants(roster(sharedPeople), ["東海大黄魚", "風蛍月", "マジエロ茉子", "humiao"], sharedPeople, "tenhou");
    expect(matches.map((match) => match.participantId)).toEqual([null, null, "player-5", "player-4"]);
    expect(matches[0].resolvedByTable).toBe(false);
  });

  it("allows the same AI to occupy two seats but not the same human", () => {
    const ai = resolveTableParticipants(roster(sharedPeople), ["◯NAGA19", "◯NAGA19", "マジエロ茉子", "humiao"], sharedPeople, "tenhou");
    expect(ai.map((match) => match.participantId)).toEqual(["player-6", "player-6", "player-5", "player-4"]);
    const human = resolveTableParticipants(roster(sharedPeople), ["humiao", "humiao", "マジエロ茉子", "◯NAGA19"], sharedPeople, "tenhou");
    expect(human[0].participantId).toBeNull();
    expect(human[1].participantId).toBeNull();
  });

  it("uses the preference rules when 何明轩 and 彭虹清 share a scheduled table", () => {
    const table = roster([hmx, xiaop, humiao, shiqiang]);
    const matches = resolveTableParticipants(table, ["猫妥", "風蛍月", "humiao", "マジエロ茉子"], sharedPeople, "tenhou");
    expect(matches.map((match) => match.participantId)).toEqual(["player-1", "player-2", "player-3", "player-4"]);
    expect(matches[1].resolvedByPreference).toBe(true);
    expect(matches[0].resolvedByPreference).toBe(true);
    expect(matches[0].resolvedByTable).toBe(false);
  });

  it("keeps the strictly derived answer instead of the preference", () => {
    const table = roster([hmx, zhao, humiao, shiqiang]);
    const matches = resolveTableParticipants(table, ["風蛍月", "東海大黄魚", "humiao", "マジエロ茉子"], sharedPeople, "tenhou");
    expect(matches.map((match) => match.participantId)).toEqual(["player-1", "player-2", "player-3", "player-4"]);
    expect(matches[1].resolvedByTable).toBe(true);
    expect(matches[1].resolvedByPreference).toBe(false);
  });

  it("does not apply the preference from a global roster without a table roster", () => {
    const matches = resolveTableParticipants(roster(sharedPeople), ["猫妥", "風蛍月", "humiao", "マジエロ茉子"], sharedPeople, "tenhou");
    expect(matches.map((match) => match.participantId)).toEqual([null, null, "player-4", "player-5"]);
    expect(matches.some((match) => match.resolvedByPreference)).toBe(false);
  });

  it("sends 東海大黄魚 to 赵得華 when 何明轩 and 赵得華 are both in the table roster", () => {
    const table = roster([hmx, zhao, xiaop, humiao]);
    const matches = resolveTableParticipants(table, ["東海大黄魚", "猫妥", "humiao", "未知路人"], sharedPeople, "tenhou");
    expect(matches[0].participantId).toBe("player-2");
    expect(matches[0].resolvedByPreference).toBe(true);
    expect(matches[1].participantId).toBeNull();
    expect(matches[2].participantId).toBe("player-4");
  });
});
