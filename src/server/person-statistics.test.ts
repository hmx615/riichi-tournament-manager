import { describe, expect, it, vi } from "vitest";
import type { Competition, Person } from "@/domain/types";

const mocks = vi.hoisted(() => ({
  listCompetitions: vi.fn(),
  listPeople: vi.fn(),
  readCachedLogs: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/competition-repository", () => ({ listCompetitions: mocks.listCompetitions }));
vi.mock("@/server/person-repository", () => ({ listPeople: mocks.listPeople }));
vi.mock("@/server/tenhou", () => ({ readCachedLogs: mocks.readCachedLogs }));

import { computeAllPersonStatistics } from "./person-statistics";

const people: Person[] = ["hmx", "p2", "p3", "p4"].map((id) => ({
  id,
  displayName: id,
  kind: "human",
  color: "#168f83",
  aliases: [id],
  accounts: [],
}));

function terminalHand() {
  return [
    [0, 0, 0], [25000, 25000, 25000, 25000], [36], [],
    [], [], [], [], [], [], [], [], [], [], [], [],
    ["和了", [11000, -6000, -3000, -2000], [0, 1, 0, "満貫", "立直(1飜)"]],
  ];
}

function competition(id: string, matchNumber: number): Competition {
  const participants = people.map((person, index) => ({
    id: `player-${index + 1}`,
    personId: person.id,
    displayName: person.displayName,
    kind: person.kind,
    color: person.color,
    usernames: [person.id],
  }));
  return {
    id,
    name: id,
    code: id.toUpperCase(),
    status: "active",
    plannedMatchCount: 10,
    initialPoints: 25000,
    rankPoints: [30, 10, -10, -30],
    participants,
    matches: [{
      id: `${id}-${matchNumber}`,
      matchNumber,
      status: "completed",
      playedAt: `2026-09-0${matchNumber}T12:00:00+08:00`,
      tenhouLogId: `${id}-log`,
      tenhouUrl: "",
      nagaUrl: null,
      nagaRatings: [{ participantId: "player-1", model: "ニシキ", rating: 90 + matchNumber, agreementRate: 0.8, badMoveRate: 0.05, decisionCount: 100 }],
      seats: participants.map((participant, seat) => ({
        seat: seat as 0 | 1 | 2 | 3,
        participantId: participant.id,
        sourceUsername: participant.id,
        rawPoints: [36000, 7700, 28200, 28100][seat],
        rank: [1, 4, 2, 3][seat] as 1 | 2 | 3 | 4,
        competitionPoints: [41, -47.3, 13.2, -6.9][seat],
        assignmentSource: "alias",
      })),
      reviewNote: null,
    }],
  };
}

describe("person statistics", () => {
  it("merges the same person across competitions", async () => {
    const competitions = [competition("cup-a", 1), competition("cup-b", 2)];
    mocks.readCachedLogs.mockResolvedValue(new Map(competitions.map((item) => [item.matches[0].tenhouLogId, {
      ref: item.matches[0].tenhouLogId,
      name: ["hmx", "p2", "p3", "p4"],
      sc: [36000, 4, 7700, 1, 28200, 3, 28100, 2],
      log: [terminalHand()],
    }])));

    const result = await computeAllPersonStatistics(people, competitions);

    expect(result.hmx.summary["对局数"]).toBe(2);
    expect(result.hmx.summary["平均顺位"]).toBe(1);
    expect(result.hmx.competitions).toHaveLength(2);
    expect(result.hmx.matches).toHaveLength(2);
    expect(result.hmx.matches[0].nagaRatings).toEqual({ "ニシキ": 92 });
    expect(result.hmx.quality).toEqual({ eligibleCount: 0, diamondRate: null, goldRate: null, horseRate: null });
    expect(result.hmx.ratings[0]).toMatchObject({ model: "ニシキ", rating: 91.5, gameCount: 2 });
    expect(result.hmx.estimatedRank).toBe(9.3);
  });

  it("calculates diamond, gold, and horse rates from complete two-model games", async () => {
    const competitions = [competition("cup-a", 1), competition("cup-b", 2), competition("cup-c", 3)];
    const kagashiRatings = [85, 93, 84];
    competitions.forEach((item, index) => item.matches[0].nagaRatings?.push({
      participantId: "player-1",
      model: "カガシ",
      rating: kagashiRatings[index],
      agreementRate: 0.8,
      badMoveRate: 0.05,
      decisionCount: 100,
    }));
    competitions[2].matches[0].nagaRatings![0].rating = 85;
    mocks.readCachedLogs.mockResolvedValue(new Map(competitions.map((item) => [item.matches[0].tenhouLogId, {
      ref: item.matches[0].tenhouLogId,
      name: ["hmx", "p2", "p3", "p4"],
      sc: [36000, 4, 7700, 1, 28200, 3, 28100, 2],
      log: [terminalHand()],
    }])));

    const result = await computeAllPersonStatistics(people, competitions);

    expect(result.hmx.quality).toEqual({ eligibleCount: 3, diamondRate: 1 / 3, goldRate: 1 / 3, horseRate: 1 / 3 });
  });

  it("aggregates multiple seats linked to the same AI person", async () => {
    const mortal: Person = {
      id: "mortal",
      displayName: "Mortal",
      kind: "ai",
      color: "#6657c7",
      aliases: ["Mortal"],
      accounts: [],
    };
    const participants = [
      { id: "player-1", personId: "hmx", displayName: "hmx", kind: "human" as const, color: "#168f83", usernames: ["hmx"] },
      ...[2, 3, 4].map((number) => ({
        id: `player-${number}`,
        personId: "mortal",
        displayName: `Mortal ${number - 1}`,
        kind: "ai" as const,
        color: "#6657c7",
        usernames: [`mortal-${number - 1}`],
      })),
    ];
    const match: Competition["matches"][number] = {
      id: "solo-vs-mortal-1",
      matchNumber: 1,
      status: "completed",
      playedAt: "2026-09-02T12:00:00+08:00",
      tenhouLogId: "solo-vs-mortal-log",
      tenhouUrl: "",
      nagaUrl: null,
      seats: participants.map((participant, seat) => ({
        seat: seat as 0 | 1 | 2 | 3,
        participantId: participant.id,
        sourceUsername: participant.usernames[0],
        rawPoints: [36000, 7700, 28200, 28100][seat],
        rank: [1, 4, 2, 3][seat] as 1 | 2 | 3 | 4,
        competitionPoints: [41, -47.3, 13.2, -6.9][seat],
        assignmentSource: "alias",
      })),
      reviewNote: null,
    };
    const soloCompetition: Competition = {
      id: "solo-vs-mortal",
      name: "Solo vs Mortal",
      code: "SVM",
      status: "active",
      plannedMatchCount: 50,
      initialPoints: 25000,
      rankPoints: [30, 10, -10, -30],
      participants,
      matches: [match],
    };
    mocks.readCachedLogs.mockResolvedValue(new Map([[match.tenhouLogId, {
      ref: match.tenhouLogId,
      name: participants.map((participant) => participant.usernames[0]),
      sc: [36000, 4, 7700, 1, 28200, 3, 28100, 2],
      log: [terminalHand()],
    }]]));

    const result = await computeAllPersonStatistics([people[0], mortal], [soloCompetition]);

    expect(result.mortal.summary["对局数"]).toBe(3);
    expect(result.mortal.summary["统计局数"]).toBe(3);
    expect(result.mortal.rankCounts).toEqual([0, 1, 1, 1]);
    expect(result.mortal.matches).toHaveLength(3);
    expect(result.mortal.competitions[0].matchCount).toBe(3);
    expect(result.mortal.estimatedRank).toBe("10+");
  });
});
