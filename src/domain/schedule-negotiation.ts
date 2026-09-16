import type {
  IndividualScheduleTable,
  NegotiationStatus,
  NegotiationVote,
  ScheduleNegotiation,
  ScheduleProposal,
} from "./types";

export const negotiationStatusLabels: Record<NegotiationStatus, string> = {
  legal_time: "待确认法定时间",
  proposal_pending: "待表决",
  legal_time_final: "按法定时间进行",
  confirmed: "已确认",
  postponed: "已顺延下周",
  overdue: "逾期",
  completed: "已完成",
  cancelled: "已取消",
};

export const rescheduleDelayMs = 7 * 24 * 60 * 60 * 1000;
export const maxProposedTimes = 4;

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 统一的时间写法：2026-09-19（周六）20:00，固定按北京时间，前后端渲染一致。 */
export function formatTableTime(iso: string) {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return iso;
  const beijing = new Date(timestamp + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}（${weekdayLabels[beijing.getUTCDay()]}）${pad(beijing.getUTCHours())}:${pad(beijing.getUTCMinutes())}`;
}

/** 前端 datetime-local 的值按比赛时区（默认 Asia/Shanghai）解释成 ISO。 */
export function parseTableTimeInput(value: string, offset = "+08:00"): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const timestamp = Date.parse(`${match[1]}T${match[2]}:${match[3] ?? "00"}${offset}`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** ISO 时间转成 datetime-local 需要的 +08:00 本地表示。 */
export function formatTableTimeInput(iso: string, offsetMinutes = 8 * 60): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp + offsetMinutes * 60 * 1000).toISOString().slice(0, 16);
}

type NegotiableTable = Pick<IndividualScheduleTable, "scheduledAt" | "participantIds" | "status" | "negotiation">;

/** 兼容旧版本的协商记录（当时叫 responses / reschedule / negotiating），读到就换算成新结构。 */
function normalizeNegotiation(stored: ScheduleNegotiation & {
  responses?: Array<{ participantId: string; status?: string; respondedAt?: string; note?: string }>;
  reschedule?: unknown;
}): ScheduleNegotiation {
  if (Array.isArray(stored.confirmations)) return stored;
  const confirmations = (stored.responses ?? []).map((response) => ({
    participantId: response.participantId,
    status: response.status === "accepted" ? "accepted" as const : "pending" as const,
    respondedAt: response.respondedAt,
    note: response.note,
  }));
  const legacyStatus = stored.status as string;
  const status: NegotiationStatus = legacyStatus === "legal_time_final"
    ? "legal_time_final"
    : legacyStatus === "confirmed"
      ? "confirmed"
      : legacyStatus === "completed"
        ? "completed"
        : legacyStatus === "cancelled"
          ? "cancelled"
          : legacyStatus === "overdue"
            ? "overdue"
            : "legal_time";
  const { responses: _responses, reschedule: _reschedule, ...rest } = stored;
  return { ...rest, status, confirmations } as ScheduleNegotiation;
}

/** 没有协商记录时，以赛程里的时间为法定时间，状态为「待确认法定时间」。 */
export function negotiationFor(table: NegotiableTable): ScheduleNegotiation {
  if (table.negotiation) return normalizeNegotiation(table.negotiation);
  return {
    status: table.status === "completed" ? "completed" : table.status === "cancelled" ? "cancelled" : "legal_time",
    legalTime: table.scheduledAt,
    currentTime: table.scheduledAt,
    candidateTimes: [],
    confirmations: table.participantIds.map((participantId) => ({ participantId, status: "pending" as const })),
    history: [],
  };
}

/** 逾期按当前时间判断，不需要后台任务：只读时就能得出。 */
export function effectiveStatus(negotiation: ScheduleNegotiation, now = Date.now()): NegotiationStatus {
  if (negotiation.status === "legal_time" || negotiation.status === "proposal_pending") {
    if (negotiation.deadline && Date.parse(negotiation.deadline) < now) return "overdue";
  }
  return negotiation.status;
}

export function negotiationStatusLabel(negotiation: ScheduleNegotiation, now = Date.now()) {
  return negotiationStatusLabels[effectiveStatus(negotiation, now)];
}

export function pendingProposal(negotiation: ScheduleNegotiation) {
  return negotiation.proposal?.status === "pending" ? negotiation.proposal : undefined;
}

export function confirmedCount(negotiation: ScheduleNegotiation) {
  return negotiation.confirmations.filter((item) => item.status === "accepted").length;
}

function allConfirmed(negotiation: ScheduleNegotiation) {
  return negotiation.confirmations.length >= 4 && negotiation.confirmations.every((item) => item.status === "accepted");
}

function others(negotiation: ScheduleNegotiation, participantId: string) {
  return negotiation.confirmations.map((item) => item.participantId).filter((id) => id !== participantId);
}

function withEvent(
  negotiation: ScheduleNegotiation,
  at: string,
  actor: string,
  action: ScheduleNegotiation["history"][number]["action"],
  detail: string,
  tone?: "accept" | "decline" | "settle",
): ScheduleNegotiation {
  return { ...negotiation, history: [...negotiation.history, { at, actor, action, detail, tone }] };
}

function assertOpen(negotiation: ScheduleNegotiation) {
  const status = effectiveStatus(negotiation);
  if (status === "confirmed" || status === "postponed" || status === "legal_time_final") throw new Error("本桌时间已经确定，不能再修改");
  if (status === "completed" || status === "cancelled") throw new Error("本桌已经结束");
  if (status === "overdue") throw new Error("本桌协商已逾期，按法定时间进行");
}

/** 确认可以参加法定时间；四人全部确认后本桌结束。 */
export function confirmLegalTime(negotiation: ScheduleNegotiation, input: { participantId: string; note?: string; at: string }): ScheduleNegotiation {
  assertOpen(negotiation);
  if (pendingProposal(negotiation)) throw new Error("本桌有待表决的申请，请先等表决结果");
  if (!others(negotiation, input.participantId).length && !negotiation.confirmations.some((item) => item.participantId === input.participantId)) {
    throw new Error("你不在这桌的参赛名单里");
  }
  const confirmations = negotiation.confirmations.map((item) => item.participantId === input.participantId
    ? { ...item, status: "accepted" as const, respondedAt: input.at, note: input.note }
    : item);
  const next = withEvent({ ...negotiation, confirmations }, input.at, input.participantId, "confirm", "确认可以参加法定时间", "accept");
  return allConfirmed(next) ? { ...next, status: "confirmed" } : { ...next, status: "legal_time" };
}

function settled(negotiation: ScheduleNegotiation, at: string, actor: string, target: string, detail: string): ScheduleNegotiation {
  const confirmations = negotiation.confirmations.map((item) => item.status === "accepted" ? item : { ...item, status: "accepted" as const, respondedAt: at, note: "通过协商确定时间" });
  return withEvent({ ...negotiation, confirmations }, at, actor, "settle", `${detail}：${formatTableTime(target)}`, "settle");
}

function createProposal(
  negotiation: ScheduleNegotiation,
  input: { participantId: string; type: ScheduleProposal["type"]; proposedTimes: string[]; note?: string; at: string; detail: string },
): ScheduleNegotiation {
  assertOpen(negotiation);
  if (pendingProposal(negotiation)) throw new Error("本桌已经有一条申请在等表决了");
  const proposal: ScheduleProposal = {
    id: `${Date.parse(input.at)}-${input.type}`,
    type: input.type,
    requestedBy: input.participantId,
    requestedAt: input.at,
    proposedTimes: input.proposedTimes,
    note: input.note,
    votes: others(negotiation, input.participantId).map((participantId) => ({ participantId, status: "pending" as const })),
    status: "pending",
  };
  const next = withEvent({ ...negotiation, proposal, proposals: [...(negotiation.proposals ?? []), proposal], status: "proposal_pending" }, input.at, input.participantId, "propose", input.detail);
  return next;
}

/** 申请更换开打时间：其他三人表决，全部同意后取最早的候选时间生效。 */
export function proposeChangeTime(negotiation: ScheduleNegotiation, input: { participantId: string; times: string[]; note?: string; at: string }): ScheduleNegotiation {
  const times = [...new Set(input.times.map((time) => time.trim()).filter(Boolean))].sort((left, right) => Date.parse(left) - Date.parse(right));
  if (!times.length) throw new Error("请至少填写一个希望开打的时间");
  if (times.length > maxProposedTimes) throw new Error(`最多可以提 ${maxProposedTimes} 个时间`);
  return createProposal(negotiation, {
    participantId: input.participantId,
    type: "change_time",
    proposedTimes: times,
    note: input.note,
    at: input.at,
    detail: `申请更换开打时间：${times.map(formatTableTime).join("、")}`,
  });
}

export function canProposePostpone(negotiation: ScheduleNegotiation) {
  if (negotiation.postponed || negotiation.postponeBlocked) return false;
  const status = effectiveStatus(negotiation);
  return status === "legal_time";
}

/** 申请顺延到下周（本周实在找不到时间时的兜底方案）。 */
export function proposePostpone(negotiation: ScheduleNegotiation, input: { participantId: string; note?: string; at: string }): ScheduleNegotiation {
  if (negotiation.postponed) throw new Error("本场已经顺延过，不能再顺延");
  if (negotiation.postponeBlocked) throw new Error("本场的顺延申请已经被拒绝过，不能再申请");
  const postponeTime = new Date(Date.parse(negotiation.legalTime) + rescheduleDelayMs).toISOString();
  return createProposal(negotiation, {
    participantId: input.participantId,
    type: "postpone",
    proposedTimes: [postponeTime],
    note: input.note,
    at: input.at,
    detail: `申请顺延一周到 ${formatTableTime(postponeTime)}${input.note ? `：${input.note}` : ""}`,
  });
}

/**
 * 给待表决的申请投票。
 * - 换时间：其他三人各自勾选自己能参加的时间（一个或多个）；三人交集的**最早**一个生效。
 * - 顺延：同意/拒绝即可；三人全部同意才顺延一周，且之后不能再顺延。
 * - 任意一人拒绝、或换时间没有共同可行时间：申请作废，回到「确认法定时间」，之前确认过的状态保留；
 *   顺延被拒还会锁掉本场的顺延入口。
 */
export function voteProposal(negotiation: ScheduleNegotiation, input: { participantId: string; accept: boolean; selectedTimes?: string[]; note?: string; at: string }): ScheduleNegotiation {
  const proposal = pendingProposal(negotiation);
  if (!proposal) throw new Error("当前没有待表决的申请");
  if (proposal.requestedBy === input.participantId) throw new Error("这是你自己提的申请，等另外三人表决即可");
  if (!proposal.votes.some((vote) => vote.participantId === input.participantId)) throw new Error("你不在这桌的参赛名单里");
  const selectedTimes = input.accept && proposal.type === "change_time"
    ? [...new Set((input.selectedTimes ?? []).filter((time) => proposal.proposedTimes.includes(time)))]
    : [];
  if (input.accept && proposal.type === "change_time" && !selectedTimes.length) throw new Error("请至少勾选一个你能参加的时间");
  const votes = proposal.votes.map((vote) => vote.participantId === input.participantId
    ? { ...vote, status: input.accept ? "accepted" as const : "declined" as const, selectedTimes, respondedAt: input.at, note: input.note }
    : vote);
  const actionLabel = proposal.type === "postpone" ? "顺延一周" : "更换开打时间";
  const detail = input.accept
    ? (selectedTimes.length ? `同意${actionLabel}，可以参加：${selectedTimes.map(formatTableTime).join("、")}` : `同意${actionLabel}`)
    : `拒绝${actionLabel}${input.note ? `：${input.note}` : ""}`;
  let next = withEvent(
    { ...negotiation, proposal: { ...proposal, votes } },
    input.at,
    input.participantId,
    "vote",
    detail,
    input.accept ? "accept" : "decline",
  );
  next = { ...next, proposals: (next.proposals ?? []).map((item) => item.id === proposal.id ? { ...item, votes } : item) };
  if (votes.some((vote) => vote.status === "declined")) {
    const resolved = { ...proposal, votes, status: "rejected" as const, resolvedAt: input.at };
    const fallback = allConfirmed(next) ? "confirmed" as const : "legal_time" as const;
    const rejected = withEvent({
      ...next,
      proposal: resolved,
      proposals: (next.proposals ?? []).map((item) => item.id === proposal.id ? resolved : item),
      status: fallback,
      postponeBlocked: proposal.type === "postpone" ? true : next.postponeBlocked,
      currentTime: next.legalTime,
    }, input.at, "admin", "vote", `${proposal.type === "postpone" ? "顺延申请" : "更换时间申请"}被否决，回到确认法定时间`, "decline");
    return rejected;
  }
  if (votes.every((vote) => vote.status === "accepted")) {
    const resolved = { ...proposal, votes, status: "accepted" as const, resolvedAt: input.at };
    // 换时间：取所有人都勾选的、最早的那个时间；没有交集则视为没谈成。
    const common = proposal.type === "change_time"
      ? proposal.proposedTimes
        .filter((time) => votes.every((vote) => (vote.selectedTimes ?? []).includes(time)))
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0]
      : proposal.proposedTimes[0];
    if (!common) {
      const failed = withEvent({
        ...next,
        proposal: { ...resolved, status: "rejected" },
        proposals: (next.proposals ?? []).map((item) => item.id === proposal.id ? { ...resolved, status: "rejected" } : item),
        status: allConfirmed(next) ? "confirmed" as const : "legal_time" as const,
        currentTime: next.legalTime,
      }, input.at, "admin", "vote", "三人的候选时间没有交集，申请作废，回到确认法定时间", "decline");
      return failed;
    }
    const settledNext = settled({
      ...next,
      proposal: resolved,
      proposals: (next.proposals ?? []).map((item) => item.id === proposal.id ? resolved : item),
      status: proposal.type === "postpone" ? "postponed" : "confirmed",
      postponed: proposal.type === "postpone" ? true : next.postponed,
      currentTime: common,
    }, input.at, input.participantId, common, proposal.type === "postpone" ? "最终确定：顺延一周" : "最终确定开打时间");
    return settledNext;
  }
  return next;
}

/** 截止时间已过且没有达成一致：按法定时间进行。 */
export function expireNegotiation(negotiation: ScheduleNegotiation, at: string): ScheduleNegotiation {
  const next = withEvent(negotiation, at, "admin", "expire", "协商截止，按法定时间进行");
  return { ...next, status: "overdue", currentTime: next.legalTime };
}

/** 管理员强制调整时间：必须填写原因，并保留原定时间。 */
export function overrideTime(negotiation: ScheduleNegotiation, input: { time: string; reason: string; at: string }): ScheduleNegotiation {
  const reason = input.reason.trim();
  if (!reason) throw new Error("强制调整时间必须填写原因");
  const previousTime = negotiation.currentTime;
  const next = withEvent(
    { ...negotiation, status: "confirmed", currentTime: input.time, proposal: negotiation.proposal?.status === "pending" ? { ...negotiation.proposal, status: "rejected", resolvedAt: input.at } : negotiation.proposal },
    input.at, "admin", "override", `强制调整到 ${formatTableTime(input.time)}（原 ${formatTableTime(previousTime)}）：${reason}`, "settle",
  );
  return { ...next, override: { at: input.at, reason, previousTime } };
}

/** 管理员设置确认截止时间：不改变已经确认过的状态。 */
export function setNegotiationDeadline(negotiation: ScheduleNegotiation, input: { deadline?: string; candidateTimes?: string[]; at: string }): ScheduleNegotiation {
  const candidateTimes = [...new Set((input.candidateTimes ?? []).filter(Boolean))].sort((left, right) => Date.parse(left) - Date.parse(right));
  const detail = [input.deadline ? `截止时间 ${formatTableTime(input.deadline)}` : "", candidateTimes.length ? `候选时间：${candidateTimes.map(formatTableTime).join("、")}` : ""].filter(Boolean).join("；");
  return withEvent({ ...negotiation, deadline: input.deadline, candidateTimes }, input.at, "admin", "deadline", detail || "更新协商设置");
}
