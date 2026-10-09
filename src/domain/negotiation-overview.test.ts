import { describe, expect, it } from "vitest";
import {
  beijingDayOf,
  currentOpenNegotiationDay,
  sessionCards,
  sessionLabel,
  negotiationDayGroups,
  participantPendingSummaries,
  tableResponseSummary,
} from "./negotiation-overview";
import type { Competition, IndividualScheduleTable, NegotiationVote } from "./types";

const table = (id: string, scheduledAt: string, round: number, tableNumber: number, participants: string[], votes: NegotiationVote[] = []): IndividualScheduleTable => ({
  id, stage: "preliminary", week: 1, round, tableNumber, scheduledAt, timezone: "Asia/Shanghai",
  participantIds: participants, status: "scheduled",
  ...(votes.length ? { negotiation: {
    status: "legal_time", legalTime: scheduledAt, currentTime: scheduledAt, candidateTimes: [],
    confirmations: participants.map((participantId) => votes.find((vote) => vote.participantId === participantId) ?? { participantId, status: "pending" as const }),
    history: [],
  } } : {}),
});

const competition = (tables: IndividualScheduleTable[]): Competition => ({
  id: "cup", name: "启明杯", code: "CUP", format: "individual", status: "active", plannedMatchCount: 64,
  initialPoints: 25000, rankPoints: [30, 10, -10, -30], matches: [], individualSchedule: tables,
  participants: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((id) => ({ id, personId: id, displayName: id, kind: "human", color: "#000", usernames: [] })),
});

describe("协商进度总览", () => {
  it("北京时间日历日：周日晚场算当天", () => {
    expect(beijingDayOf("2026-10-11T12:00:00.000Z")).toBe("2026-10-11");
    expect(beijingDayOf("2026-10-11T13:00:00.000Z")).toBe("2026-10-11");
    expect(beijingDayOf("2026-10-12T00:00:00.000Z")).toBe("2026-10-12");
  });

  it("整桌确认状态：全确认 / 还差人 / 有人拒绝", () => {
    const all = table("t1", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [
      { participantId: "p1", status: "accepted" }, { participantId: "p2", status: "accepted" },
      { participantId: "p3", status: "accepted" }, { participantId: "p4", status: "accepted" },
    ]);
    expect(tableResponseSummary(all)).toMatchObject({ responded: 4, total: 4, declined: 0, allConfirmed: true });

    const partial = table("t2", "2026-10-11T12:00:00Z", 1, 2, ["p5", "p6", "p7", "p8"], [{ participantId: "p5", status: "accepted" }]);
    expect(tableResponseSummary(partial)).toMatchObject({ responded: 1, total: 4, allConfirmed: false });

    const declined = table("t3", "2026-10-11T12:00:00Z", 1, 3, ["p1", "p2", "p3", "p4"], [{ participantId: "p2", status: "declined" }]);
    expect(tableResponseSummary(declined)).toMatchObject({ responded: 1, declined: 1, allConfirmed: false });
  });

  it("按天分组：同一天两轮并进同一个抽屉", () => {
    const tables = [
      table("a", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [
        { participantId: "p1", status: "accepted" }, { participantId: "p2", status: "accepted" },
        { participantId: "p3", status: "accepted" }, { participantId: "p4", status: "accepted" }]),
      table("b", "2026-10-11T13:00:00Z", 2, 1, ["p5", "p6", "p7", "p8"], [{ participantId: "p5", status: "accepted" }]),
      table("c", "2026-10-14T12:00:00Z", 3, 1, ["p1", "p2", "p3", "p4"]),
    ];
    const days = negotiationDayGroups(competition(tables));
    expect(days).toHaveLength(2);
    expect(days[0].day).toBe("2026-10-11");
    expect(days[0].rounds).toEqual([1, 2]);
    expect(days[0].responded).toBe(5);
    expect(days[0].total).toBe(8);
    expect(days[0].complete).toBe(false);
    expect([...days[0].waiting].sort()).toEqual(["p6", "p7", "p8"]);
    expect(days[1].day).toBe("2026-10-14");
    expect(days[1].responded).toBe(0);
    expect([...days[1].waiting].sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("整天都确认完时标记 complete", () => {
    const tables = [table("a", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [
      { participantId: "p1", status: "accepted" }, { participantId: "p2", status: "accepted" },
      { participantId: "p3", status: "accepted" }, { participantId: "p4", status: "accepted" }])];
    const days = negotiationDayGroups(competition(tables));
    expect(days[0].complete).toBe(true);
    expect(days[0].waiting).toEqual([]);
  });

  it("每人还欠几场，按欠得多的排前面", () => {
    const tables = [
      table("a", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [
        { participantId: "p1", status: "accepted" }, { participantId: "p2", status: "declined" }]),
      table("b", "2026-10-11T13:00:00Z", 2, 1, ["p1", "p2", "p3", "p4"]),
      table("c", "2026-10-14T12:00:00Z", 3, 1, ["p1", "p2", "p3", "p4"]),
    ];
    const rows = participantPendingSummaries(competition(tables));
    const p1 = rows.find((row) => row.participantId === "p1")!;
    expect(p1.total).toBe(3);
    expect(p1.responded).toBe(1);
    expect(p1.pending).toBe(2);
    expect(p1.pendingTables.map((item) => item.round)).toEqual([2, 3]);
    const p2 = rows.find((row) => row.participantId === "p2")!;
    expect(p2.declinedTables).toHaveLength(1);
    // 没排到桌次的人 total 为 0，不算欠账
    const p5 = rows.find((row) => row.participantId === "p5")!;
    expect(p5.total).toBe(0);
  });

  it("待回应按场次拆开：名字后面要能标出是哪一场", () => {
    // p1 只欠 20:00 那场，p2 只欠 21:00 那场
    const tables = [
      table("a", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [
        { participantId: "p2", status: "accepted" }, { participantId: "p3", status: "accepted" }, { participantId: "p4", status: "accepted" }]),
      table("b", "2026-10-11T13:00:00Z", 2, 1, ["p1", "p2", "p3", "p4"], [
        { participantId: "p1", status: "accepted" }, { participantId: "p3", status: "accepted" }, { participantId: "p4", status: "accepted" }]),
    ];
    const days = negotiationDayGroups(competition(tables));
    const first = days[0].waitingByRound.find((item) => item.round === 1)!;
    const second = days[0].waitingByRound.find((item) => item.round === 2)!;
    expect(first.participantIds).toEqual(["p1"]);
    expect(second.participantIds).toEqual(["p2"]);
    // 去重后当天还欠的人仍是两个
    expect([...days[0].waiting].sort()).toEqual(["p1", "p2"]);
  });

  it("桌按未确认人数降序：四个人都没回的排最前", () => {
    const allPending = (id: string, round: number, tableNumber: number) => table(id, "2026-10-11T12:00:00Z", round, tableNumber, ["p1", "p2", "p3", "p4"]);
    const half = (id: string, round: number, tableNumber: number) => table(id, "2026-10-11T12:00:00Z", round, tableNumber, ["p1", "p2", "p3", "p4"], [
      { participantId: "p1", status: "accepted" }, { participantId: "p2", status: "accepted" }]);
    const full = (id: string, round: number, tableNumber: number) => table(id, "2026-10-11T12:00:00Z", round, tableNumber, ["p1", "p2", "p3", "p4"], [
      { participantId: "p1", status: "accepted" }, { participantId: "p2", status: "accepted" },
      { participantId: "p3", status: "accepted" }, { participantId: "p4", status: "accepted" }]);
    const days = negotiationDayGroups(competition([
      full("z", 1, 3), allPending("y", 1, 2), half("x", 1, 1),
    ]));
    const waitingCounts = days[0].tables.map((item) => item.responses.filter((entry) => entry.status === "pending").length);
    expect(waitingCounts).toEqual([4, 2, 0]);
  });
});

describe("场次卡片", () => {
  const accepted = (pid: string) => ({ participantId: pid, status: "accepted" as const });

  it("八点那场叫八点场，九点那场叫九点场", () => {
    expect(sessionLabel("2026-10-11T12:00:00Z")).toBe("八点场");
    expect(sessionLabel("2026-10-11T13:00:00Z")).toBe("九点场");
  });

  it("同一天拆成八点场、九点场两张卡片，各自带确认进度", () => {
    const tables = [
      table("a", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [accepted("p1")]),
      table("b", "2026-10-11T13:00:00Z", 2, 1, ["p1", "p2", "p3", "p4"], []),
    ];
    const day = negotiationDayGroups(competition(tables))[0];
    const cards = sessionCards(competition(tables), day);
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.label)).toEqual(["八点场", "九点场"]);
    expect(cards[0].confirmed).toBe(1);
    expect(cards[1].confirmed).toBe(0);
    expect(cards[1].entries.filter((item) => item.status === "pending")).toHaveLength(4);
  });

  it("有协商在进行的桌次标成需要介入", () => {
    const withProposal = table("a", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [accepted("p1")]);
    withProposal.negotiation = { ...withProposal.negotiation!, status: "proposal_pending" } as any;
    const day = negotiationDayGroups(competition([withProposal]))[0];
    const cards = sessionCards(competition([withProposal]), day);
    expect(cards[0].adminCount).toBe(3);
    expect(cards[0].entries.every((item) => item.needsAdmin)).toBe(true);
  });

  it("当前该盯的那一天：这轮回完就自动落到下一轮", () => {
    // 第一天只回了一半 -> 还该盯第一天
    const partial = table("a", "2026-10-11T12:00:00Z", 1, 1, ["p1", "p2", "p3", "p4"], [accepted("p1"), accepted("p2")]);
    const later = table("b", "2026-10-14T12:00:00Z", 3, 1, ["p1", "p2", "p3", "p4"]);
    const tables = [partial, later];
    const days = negotiationDayGroups(competition(tables));
    expect(currentOpenNegotiationDay(days, () => true)?.day).toBe("2026-10-11");
    // 第一天全部回完 -> 自动落到第二天，不用管理员手动切
    const finished = negotiationDayGroups(competition([
      { ...partial, negotiation: { ...partial.negotiation!, confirmations: ["p1", "p2", "p3", "p4"].map((id) => ({ participantId: id, status: "accepted" as const })) } } as any,
      later,
    ]));
    expect(currentOpenNegotiationDay(finished, () => true)?.day).toBe("2026-10-14");
    // 一天都还没开放 -> 没有当前场次
    expect(currentOpenNegotiationDay(days, () => false)).toBeNull();
  });
});
