import { describe, expect, it } from "vitest";
import type { IndividualScheduleTable } from "./types";
import {
  canProposePostpone,
  confirmLegalTime,
  effectiveStatus,
  expireNegotiation,
  formatTableTimeInput,
  negotiationFor,
  overrideTime,
  parseTableTimeInput,
  proposeChangeTime,
  proposePostpone,
  setNegotiationDeadline,
  voteProposal,
} from "./schedule-negotiation";

const legalTime = "2026-09-18T12:00:00.000Z";
const at = "2026-09-15T00:00:00.000Z";
const table: IndividualScheduleTable = {
  id: "cup-preliminary-1-1",
  stage: "preliminary",
  round: 1,
  tableNumber: 1,
  scheduledAt: legalTime,
  timezone: "Asia/Shanghai",
  participantIds: ["a", "b", "c", "d"],
  status: "scheduled",
};

const allConfirm = () => ["a", "b", "c", "d"].reduce(
  (negotiation, participantId) => confirmLegalTime(negotiation, { participantId, at }),
  negotiationFor(table),
);

describe("时间协商", () => {
  it("默认以赛程时间为法定时间，四人全部确认后结束", () => {
    const negotiation = negotiationFor(table);
    expect(negotiation.status).toBe("legal_time");
    expect(negotiation.legalTime).toBe(legalTime);
    const three = ["a", "b", "c"].reduce((current, participantId) => confirmLegalTime(current, { participantId, at }), negotiation);
    expect(three.status).toBe("legal_time");
    const done = confirmLegalTime(three, { participantId: "d", at });
    expect(done.status).toBe("confirmed");
    expect(done.currentTime).toBe(legalTime);
  });

  it("确认过的人不会被重复确认或申请影响", () => {
    let negotiation = confirmLegalTime(negotiationFor(table), { participantId: "a", at });
    negotiation = confirmLegalTime(negotiation, { participantId: "a", at: "2026-09-15T01:00:00.000Z" });
    expect(negotiation.confirmations.filter((item) => item.status === "accepted")).toHaveLength(1);
  });

  it("换时间申请：其他三人全部同意后取最早的候选时间生效", () => {
    let negotiation = proposeChangeTime(negotiationFor(table), { participantId: "a", times: ["2026-09-20T12:00:00.000Z", "2026-09-19T12:00:00.000Z"], note: "周六有事", at });
    expect(negotiation.status).toBe("proposal_pending");
    expect(negotiation.proposal?.proposedTimes[0]).toBe("2026-09-19T12:00:00.000Z");
    for (const participantId of ["b", "c"]) {
      negotiation = voteProposal(negotiation, { participantId, accept: true, selectedTimes: ["2026-09-19T12:00:00.000Z"], at });
      expect(negotiation.status).toBe("proposal_pending");
    }
    negotiation = voteProposal(negotiation, { participantId: "d", accept: true, selectedTimes: ["2026-09-19T12:00:00.000Z", "2026-09-20T12:00:00.000Z"], at });
    expect(negotiation.status).toBe("confirmed");
    expect(negotiation.currentTime).toBe("2026-09-19T12:00:00.000Z");
    expect(negotiation.proposal?.status).toBe("accepted");
    // 敲定后所有人都是已确认，并且留下一条高亮的敲定记录
    expect(negotiation.confirmations.every((item) => item.status === "accepted")).toBe(true);
    const settledEvent = negotiation.history.at(-1);
    expect(settledEvent?.tone).toBe("settle");
    expect(settledEvent?.detail).toContain("2026-09-19（周六）20:00");
  });

  it("换时间：三人各选一个或多个，取共同可行的最早时间；没有交集就作废", () => {
    const times = ["2026-09-19T12:00:00.000Z", "2026-09-20T12:00:00.000Z", "2026-09-21T12:00:00.000Z"];
    let negotiation = proposeChangeTime(negotiationFor(table), { participantId: "a", times, at });
    negotiation = voteProposal(negotiation, { participantId: "b", accept: true, selectedTimes: [times[0], times[1]], at });
    negotiation = voteProposal(negotiation, { participantId: "c", accept: true, selectedTimes: [times[1], times[2]], at });
    negotiation = voteProposal(negotiation, { participantId: "d", accept: true, selectedTimes: [times[1]], at });
    expect(negotiation.status).toBe("confirmed");
    expect(negotiation.currentTime).toBe(times[1]);
    expect(negotiation.history.some((item) => item.tone === "accept" && item.detail.includes("可以参加"))).toBe(true);

    let failed = proposeChangeTime(negotiationFor(table), { participantId: "a", times, at });
    failed = voteProposal(failed, { participantId: "b", accept: true, selectedTimes: [times[0]], at });
    failed = voteProposal(failed, { participantId: "c", accept: true, selectedTimes: [times[1]], at });
    failed = voteProposal(failed, { participantId: "d", accept: true, selectedTimes: [times[2]], at });
    expect(failed.status).toBe("legal_time");
    expect(failed.currentTime).toBe(legalTime);
    expect(failed.proposal?.status).toBe("rejected");
    expect(failed.history.at(-1)?.detail).toContain("没有交集");
  });

  it("换时间被拒：回到确认法定时间，已确认的选择保留，可以再提申请", () => {
    let negotiation = ["b", "c"].reduce((current, participantId) => confirmLegalTime(current, { participantId, at }), negotiationFor(table));
    negotiation = proposeChangeTime(negotiation, { participantId: "a", times: ["2026-09-20T12:00:00.000Z"], at });
    negotiation = voteProposal(negotiation, { participantId: "d", accept: false, note: "那天没空", at });
    expect(negotiation.status).toBe("legal_time");
    expect(negotiation.currentTime).toBe(legalTime);
    expect(negotiation.proposal?.status).toBe("rejected");
    // b、c 之前确认过，不需要重新确认
    expect(negotiation.confirmations.filter((item) => item.status === "accepted").map((item) => item.participantId)).toEqual(["b", "c"]);
    expect(canProposePostpone(negotiation)).toBe(true);
    expect(() => proposeChangeTime(negotiation, { participantId: "a", times: ["2026-09-21T12:00:00.000Z"], at })).not.toThrow();
  });

  it("顺延申请：三人全部同意后顺延一周，且本场不能再顺延", () => {
    let negotiation = proposePostpone(negotiationFor(table), { participantId: "a", note: "本周出差", at });
    expect(negotiation.proposal?.type).toBe("postpone");
    expect(negotiation.proposal?.proposedTimes[0]).toBe(new Date(Date.parse(legalTime) + 7 * 24 * 60 * 60 * 1000).toISOString());
    for (const participantId of ["b", "c", "d"]) {
      negotiation = voteProposal(negotiation, { participantId, accept: true, at });
    }
    expect(negotiation.status).toBe("postponed");
    expect(negotiation.postponed).toBe(true);
    expect(negotiation.currentTime).toBe(new Date(Date.parse(legalTime) + 7 * 24 * 60 * 60 * 1000).toISOString());
    expect(canProposePostpone(negotiation)).toBe(false);
    expect(() => proposePostpone(negotiation, { participantId: "b", at })).toThrow("不能");
  });

  it("顺延被拒：回到确认法定时间，保留原确认，并且本场不能再申请顺延", () => {
    let negotiation = confirmLegalTime(negotiationFor(table), { participantId: "a", at });
    negotiation = proposePostpone(negotiation, { participantId: "b", at });
    negotiation = voteProposal(negotiation, { participantId: "c", accept: false, note: "不想拖到下周", at });
    expect(negotiation.status).toBe("legal_time");
    expect(negotiation.currentTime).toBe(legalTime);
    expect(negotiation.postponeBlocked).toBe(true);
    expect(negotiation.confirmations.find((item) => item.participantId === "a")?.status).toBe("accepted");
    expect(canProposePostpone(negotiation)).toBe(false);
    expect(() => proposePostpone(negotiation, { participantId: "d", at })).toThrow("已经被拒绝");
  });

  it("同一时间只能有一条待表决申请，申请人自己不能投票", () => {
    const negotiation = proposeChangeTime(negotiationFor(table), { participantId: "a", times: ["2026-09-20T12:00:00.000Z"], at });
    expect(() => proposeChangeTime(negotiation, { participantId: "b", times: ["2026-09-21T12:00:00.000Z"], at })).toThrow("已经有一条申请");
    expect(() => confirmLegalTime(negotiation, { participantId: "b", at })).toThrow("待表决");
    expect(() => voteProposal(negotiation, { participantId: "a", accept: true, selectedTimes: [], at })).toThrow("你自己提的申请");
    expect(() => voteProposal(negotiation, { participantId: "b", accept: true, selectedTimes: [], at })).toThrow("至少勾选一个");
  });

  it("截止时间过了按法定时间进行，管理员可以强制调整并保留原时间", () => {
    const negotiation = setNegotiationDeadline(negotiationFor(table), { deadline: "2026-09-17T12:00:00.000Z", at });
    expect(effectiveStatus(negotiation, Date.parse("2026-09-18T00:00:00.000Z"))).toBe("overdue");
    expect(expireNegotiation(negotiation, "2026-09-18T00:00:00.000Z").currentTime).toBe(legalTime);
    const forced = overrideTime(negotiationFor(table), { time: "2026-09-19T12:00:00.000Z", reason: "场地冲突", at });
    expect(forced.status).toBe("confirmed");
    expect(forced.legalTime).toBe(legalTime);
    expect(forced.override).toEqual({ at, reason: "场地冲突", previousTime: legalTime });
    expect(() => overrideTime(negotiationFor(table), { time: legalTime, reason: " ", at })).toThrow("必须填写原因");
  });

  it("本地时间输入按 +08:00 解释", () => {
    expect(parseTableTimeInput("2026-09-19T20:00")).toBe("2026-09-19T12:00:00.000Z");
    expect(parseTableTimeInput("2026-09-19 20:00")).toBeNull();
    expect(formatTableTimeInput("2026-09-19T12:00:00.000Z")).toBe("2026-09-19T20:00");
  });
});
