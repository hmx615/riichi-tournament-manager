import { describe, expect, it } from "vitest";
import type { Competition, MatchRecord } from "./types";
import { correctMatchSeats } from "./match-correction";

const participants = [
  { id: "a", personId: "person-a", displayName: "甲", kind: "human" as const, color: "#111111", usernames: ["ali-a"] },
  { id: "b", personId: "person-b", displayName: "乙", kind: "human" as const, color: "#222222", usernames: ["ali-b"] },
  { id: "c", personId: "person-c", displayName: "丙", kind: "human" as const, color: "#333333", usernames: ["ali-c"] },
  { id: "d", personId: "person-d", displayName: "丁", kind: "human" as const, color: "#444444", usernames: ["ali-d"] },
  { id: "naga", personId: "naga", displayName: "NAGA", kind: "ai" as const, color: "#555555", usernames: ["NAGA"] },
];

const match: MatchRecord = {
  id: "cup-001",
  matchNumber: 1,
  status: "completed",
  playedAt: "2026-09-01T12:00:00.000Z",
  tenhouLogId: "majsoul-abc",
  tenhouUrl: "",
  sourceType: "majsoul",
  nagaUrl: null,
  seats: ["a", "b", "c", "naga"].map((participantId, seat) => ({
    seat: seat as 0 | 1 | 2 | 3,
    participantId,
    sourceUsername: `原始昵称${seat}`,
    rawPoints: 25000 + seat,
    rank: (seat + 1) as 1 | 2 | 3 | 4,
    competitionPoints: [30, 10, -10, -30][seat],
    assignmentSource: "alias" as const,
  })),
  nagaRatings: [
    { participantId: "a", model: "ニシキ", rating: 90, agreementRate: 0.8, badMoveRate: 0.05, decisionCount: 100 },
    { participantId: "c", model: "カガシ", rating: 80, agreementRate: 0.7, badMoveRate: 0.06, decisionCount: 100 },
  ],
  reviewNote: null,
};

function competition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: "cup",
    name: "测试杯",
    code: "CUP",
    status: "active",
    plannedMatchCount: 10,
    initialPoints: 25000,
    rankPoints: [30, 10, -10, -30],
    participants,
    matches: [match],
    ...overrides,
  } as Competition;
}

describe("match seat correction", () => {
  it("swaps identities without touching raw usernames, points or ranks", () => {
    const corrected = correctMatchSeats(competition(), match, { participantIds: ["b", "a", "c", "naga"], reason: "甲和乙的账号填反了", at: "2026-09-02T00:00:00.000Z" });
    expect(corrected.seats.map((seat) => seat.participantId)).toEqual(["b", "a", "c", "naga"]);
    expect(corrected.seats.map((seat) => seat.sourceUsername)).toEqual(["原始昵称0", "原始昵称1", "原始昵称2", "原始昵称3"]);
    expect(corrected.seats.map((seat) => seat.rawPoints)).toEqual([25000, 25001, 25002, 25003]);
    expect(corrected.seats.map((seat) => seat.competitionPoints)).toEqual([30, 10, -10, -30]);
    expect(corrected.seats.map((seat) => seat.assignmentSource)).toEqual(["manual", "manual", "alias", "alias"]);
  });

  it("appends an audit record with reason and changed seats", () => {
    const corrected = correctMatchSeats(competition(), match, { participantIds: ["b", "a", "c", "naga"], reason: "身份反转", at: "2026-09-02T00:00:00.000Z" });
    expect(corrected.corrections).toEqual([{
      at: "2026-09-02T00:00:00.000Z",
      reason: "身份反转",
      changes: [
        { seat: 0, sourceUsername: "原始昵称0", fromParticipantId: "a", toParticipantId: "b" },
        { seat: 1, sourceUsername: "原始昵称1", fromParticipantId: "b", toParticipantId: "a" },
      ],
    }]);
  });

  it("moves NAGA ratings with the seat", () => {
    const corrected = correctMatchSeats(competition(), match, { participantIds: ["b", "a", "c", "naga"], reason: "身份反转" });
    expect(corrected.nagaRatings?.map((rating) => rating.participantId)).toEqual(["b", "c"]);
  });

  it("keeps previous corrections and stacks new ones", () => {
    const once = correctMatchSeats(competition(), match, { participantIds: ["b", "a", "c", "naga"], reason: "第一次" });
    const twice = correctMatchSeats(competition(), { ...once }, { participantIds: ["a", "b", "c", "naga"], reason: "第二次" });
    expect(twice.corrections?.map((item) => item.reason)).toEqual(["第一次", "第二次"]);
  });

  it("rejects an empty reason, duplicates and unknown participants", () => {
    expect(() => correctMatchSeats(competition(), match, { participantIds: ["b", "a", "c", "naga"], reason: "   " })).toThrow("请填写修改原因");
    expect(() => correctMatchSeats(competition(), match, { participantIds: ["a", "a", "c", "naga"], reason: "重复" })).toThrow("同一人类选手");
    expect(() => correctMatchSeats(competition(), match, { participantIds: ["a", "b", "c", "outside"], reason: "外卡" })).toThrow("不属于本比赛");
    expect(() => correctMatchSeats(competition(), match, { participantIds: ["a", "b", "c", "naga"], reason: "没改" })).toThrow("没有变化");
  });

  it("allows the same AI in two seats but rejects the same human twice", () => {
    const ai = correctMatchSeats(competition(), match, { participantIds: ["b", "c", "naga", "naga"], reason: "两个AI座" });
    expect(ai.seats.map((seat) => seat.participantId)).toEqual(["b", "c", "naga", "naga"]);
    expect(() => correctMatchSeats(competition(), match, { participantIds: ["a", "b", "c", "c"], reason: "人类重复" })).toThrow("同一人类选手");
  });

  it("keeps a corrected match inside its scheduled table roster", () => {
    const scheduled = { ...match, scheduleId: "cup-final-1-1" };
    const withSchedule = competition({
      matches: [scheduled],
      individualSchedule: [{
        id: "cup-final-1-1", stage: "final", round: 1, tableNumber: 1, scheduledAt: "2026-09-01T12:00:00.000Z",
        timezone: "Asia/Shanghai", participantIds: ["a", "b", "c", "d"], status: "completed",
      }],
    });
    expect(correctMatchSeats(withSchedule, scheduled, { participantIds: ["b", "a", "c", "d"], reason: "换回丁" }).seats.map((seat) => seat.participantId)).toEqual(["b", "a", "c", "d"]);
    expect(() => correctMatchSeats(withSchedule, scheduled, { participantIds: ["a", "b", "c", "naga"], reason: "不在这桌" })).toThrow("必须与该桌名单一致");
  });
});
