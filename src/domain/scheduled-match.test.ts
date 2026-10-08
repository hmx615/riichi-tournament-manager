import { describe, expect, it } from "vitest";
import { completeScheduledMatch, entrySchedule, participantIdForPerson, tableHasParticipant } from "./scheduled-match";
import type { Competition, MatchRecord } from "./types";

export function fixture() {
  const competition: Competition = {
    id: "scheduled-test", name: "Test", code: "TEST", format: "individual", status: "active", plannedMatchCount: 8, initialPoints: 25000, rankPoints: [30, 10, -10, -30],
    participants: ["a", "b", "c", "d", "e"].map((id) => ({ id, displayName: id, kind: "human", color: "#000000", usernames: [id] })), matches: [],
    individualSchedule: [{ id: "s1", stage: "preliminary", round: 1, tableNumber: 2, scheduledAt: "2026-09-12T12:00:00Z", timezone: "Asia/Shanghai", participantIds: ["a", "b", "c", "d"], status: "scheduled" }],
  };
  const match: MatchRecord = { id: "m1", matchNumber: 1, scheduleId: "s1", status: "completed", playedAt: "2026-09-12T12:00:00Z", tenhouLogId: "log1", tenhouUrl: "", nagaUrl: null, reviewNote: null,
    seats: ["d", "b", "a", "c"].map((id, seat) => ({ seat: seat as 0 | 1 | 2 | 3, participantId: id, sourceUsername: id, rawPoints: 25000, rank: (seat + 1) as 1 | 2 | 3 | 4, competitionPoints: 0, assignmentSource: "manual" })),
  };
  return { competition, match };
}

describe("scheduled match association", () => {
  it("links a reordered set of four seats and marks the table complete", () => {
    const { competition, match } = fixture();
    completeScheduledMatch(competition, match);
    expect(match).toMatchObject({ stage: "preliminary", round: 1, tableNumber: 2 });
    expect(competition.individualSchedule![0]).toMatchObject({ status: "completed", matchNumber: 1 });
    expect(() => completeScheduledMatch(competition, { ...match, matchNumber: 2 })).toThrow("已经录入");
  });
  it("rejects a missing or cancelled table", () => {
    const { competition } = fixture();
    expect(() => entrySchedule(competition, "")).toThrow("具体赛程");
    competition.individualSchedule![0].status = "cancelled";
    expect(() => entrySchedule(competition, "s1")).toThrow("已取消");
  });
  it.each(["e", "b"])("rejects a foreign or duplicated participant %s", (id) => {
    const { competition, match } = fixture();
    match.seats[0].participantId = id;
    expect(() => completeScheduledMatch(competition, match)).toThrow("四名选手");
    expect(competition.individualSchedule![0].status).toBe("scheduled");
  });
});

describe("选手只能给自己那桌录牌谱", () => {
  function withPeople() {
    const { competition } = fixture();
    competition.participants = competition.participants.map((participant, index) => ({ ...participant, personId: `person-${participant.id}` }));
    return competition;
  }

  it("把人的人物 ID 换算成本届的参赛席位", () => {
    const competition = withPeople();
    expect(participantIdForPerson(competition, "person-b")).toBe("b");
    expect(participantIdForPerson(competition, "person-missing")).toBeNull();
  });

  it("本桌选手可以录这一桌", () => {
    const competition = withPeople();
    expect(tableHasParticipant(competition, competition.individualSchedule![0], "person-a")).toBe(true);
    expect(tableHasParticipant(competition, competition.individualSchedule![0], "person-d")).toBe(true);
  });

  it("不在本桌的选手被挡住（哪怕他是同一个人赛的参赛者）", () => {
    const competition = withPeople();
    expect(tableHasParticipant(competition, competition.individualSchedule![0], "person-e")).toBe(false);
  });

  it("没有绑定人物或人物不在名单里时一律挡住", () => {
    const competition = withPeople();
    expect(tableHasParticipant(competition, competition.individualSchedule![0], "")).toBe(false);
    expect(tableHasParticipant(competition, competition.individualSchedule![0], "person-不存在")).toBe(false);
    // 参赛席位没有 personId 时，人物 ID 匹配不上任何人。
    const anonymous = fixture().competition;
    expect(tableHasParticipant(anonymous, anonymous.individualSchedule![0], "person-a")).toBe(false);
  });
});
