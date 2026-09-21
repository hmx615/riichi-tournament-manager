import { describe, expect, it, vi } from "vitest";
import type { Person } from "@/domain/types";
import type { CasualRecord } from "@/domain/casual-record";

vi.mock("server-only", () => ({}));
vi.mock("@/server/person-repository", () => ({ listPeople: vi.fn() }));
vi.mock("@/server/casual-repository", () => ({
  casualDataVersion: vi.fn(),
  listCasualRecords: vi.fn(),
  readCasualLogs: vi.fn(),
}));
vi.mock("@/server/person-statistics", () => ({
  computePersonStatistics: vi.fn(),
  withCurrentPersonProfiles: vi.fn(),
}));
vi.mock("@/server/stats-snapshot", () => ({ cachedSnapshot: vi.fn(), SNAPSHOT_REVISION: 4 }));

import { casualStatisticsCompetition, orderedCasualRecords } from "./casual-statistics";

const people: Person[] = [
  { id: "hmx", displayName: "Traaaaa", kind: "human", color: "#168f83", aliases: ["風蛍月"], accounts: [] },
  { id: "wdj", displayName: "卡夫卡爱上坡路", kind: "human", color: "#c05a4a", aliases: ["Veritas"], accounts: [] },
];

function record(overrides: Partial<CasualRecord> = {}): CasualRecord {
  return {
    id: "r1",
    playedAt: "2026-09-20T12:00:00+08:00",
    sourceType: "tenhou",
    sourceUrl: "https://tenhou.net/3/?log=2026092012gm-0009-1940-410308be",
    tenhouLogId: "2026092012gm-0009-1940-410308be",
    tenhouUrl: "https://tenhou.net/3/?log=2026092012gm-0009-1940-410308be",
    nagaUrl: null,
    nagaReportId: null,
    contentFingerprint: "fp",
    seats: [
      { seat: 0, personId: "hmx", guestName: null, sourceUsername: "風蛍月", rawPoints: 42000, rank: 1 },
      { seat: 1, personId: "wdj", guestName: null, sourceUsername: "Veritas", rawPoints: 25000, rank: 2 },
      { seat: 2, personId: null, guestName: "路人甲", sourceUsername: "unknown_one", rawPoints: 20000, rank: 3 },
      { seat: 3, personId: null, guestName: "路人乙", sourceUsername: "unknown_two", rawPoints: 13000, rank: 4 },
    ],
    nagaRatings: [],
    createdByPersonId: "wdj",
    createdByUsername: "wdj",
    createdAt: "2026-09-20T13:00:00.000Z",
    ...overrides,
  };
}

describe("散排虚拟比赛", () => {
  it("把人物映射成 person-<id>，路人映射成 guest 参与者", () => {
    const competition = casualStatisticsCompetition(people, [record()]);
    expect(competition.id).toBe("casual-rank");
    expect(competition.participants.map((participant) => participant.id).sort())
      .toEqual(["guest-r1-2", "guest-r1-3", "person-hmx", "person-wdj"]);
    const match = competition.matches[0];
    expect(match.seats.map((seat) => seat.participantId)).toEqual(["person-hmx", "person-wdj", "guest-r1-2", "guest-r1-3"]);
    expect(match.seats.find((seat) => seat.seat === 2)?.sourceUsername).toBe("unknown_one");
    expect(match.tenhouLogId).toBe("2026092012gm-0009-1940-410308be");
    expect(competition.participants.find((participant) => participant.id === "guest-r1-2")?.displayName).toBe("路人甲");
  });

  it("只保留出现在散排里的 NAGA 评分", () => {
    const competition = casualStatisticsCompetition(people, [record({
      nagaUrl: "https://ricochet.cn/report",
      nagaRatings: [
        { seat: 0, model: "ニシキ", rating: 9.5, agreementRate: 0.8, badMoveRate: 0.1, decisionCount: 100 },
        { seat: 2, model: "ニシキ", rating: 7.1, agreementRate: 0.7, badMoveRate: 0.2, decisionCount: 90 },
      ],
    })]);
    expect(competition.matches[0].nagaRatings?.map((rating) => rating.participantId).sort())
      .toEqual(["guest-r1-2", "person-hmx"]);
  });

  it("场次编号按对局时间排序", () => {
    const ordered = orderedCasualRecords([
      record({ id: "later", playedAt: "2026-09-21T12:00:00+08:00" }),
      record({ id: "earlier", playedAt: "2026-09-19T12:00:00+08:00" }),
    ]);
    const competition = casualStatisticsCompetition(people, ordered);
    expect(competition.matches.map((match) => [match.matchNumber, match.id])).toEqual([
      [1, "casual-earlier"],
      [2, "casual-later"],
    ]);
  });
});
