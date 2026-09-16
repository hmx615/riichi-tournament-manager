import type { Competition, IndividualScheduleTable } from "@/domain/types";
import { confirmedCount, formatTableTime, formatTableTimeInput, negotiationFor, negotiationStatusLabel, pendingProposal } from "@/domain/schedule-negotiation";
import { expireNegotiationAction, overrideScheduleTimeAction, setNegotiationDeadlineAction } from "@/app/competitions/[competitionId]/schedule/actions";

const stampFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatTime = formatTableTime;
const formatStamp = (iso: string) => Number.isFinite(Date.parse(iso)) ? stampFormatter.format(new Date(iso)) : iso;

const statusClass = (status: string) => status === "confirmed" || status === "postponed" ? "confirmed" : status === "overdue" || status === "legal_time_final" ? "final" : "pending";

export function ScheduleNegotiationPanel({ competition, table }: {
  competition: Competition;
  table: IndividualScheduleTable;
}) {
  const negotiation = negotiationFor(table);
  const status = negotiationStatusLabel(negotiation);
  const participantById = new Map(competition.participants.map((participant) => [participant.id, participant]));
  const confirmLabels = { pending: "待确认法定时间", accepted: "已确认", declined: "不能参加" } as const;
  const voteLabels = { pending: "待表决", accepted: "同意", declined: "拒绝" } as const;
  const proposal = pendingProposal(negotiation);
  const finished = table.status === "completed";
  const lastProposal = negotiation.proposals?.at(-1);
  const settledTime = finished || ["confirmed", "postponed"].includes(negotiation.status);
  return <details className="negotiation-panel" open={!finished}>
    <summary>
      <span className={`negotiation-status ${statusClass(negotiation.status)}`}>{status}</span>
      <span className="negotiation-summary-time">当前 {formatTime(negotiation.currentTime)}</span>
      <span className="negotiation-summary-meta">已确认法定时间 {confirmedCount(negotiation)}/4{negotiation.deadline ? ` · 截止 ${formatTime(negotiation.deadline)}` : ""}{negotiation.postponed ? " · 已顺延下周" : negotiation.postponeBlocked ? " · 顺延已被拒" : ""}{negotiation.override ? " · 管理员强制调整" : ""}</span>
      <span className="negotiation-toggle">展开 / 收起协商面板</span>
    </summary>
    <div className="negotiation-body">
      <div className="negotiation-times">
        <div><b>法定时间</b><span>{formatTime(negotiation.legalTime)}</span></div>
        <div className={`current-time ${settledTime ? "settled" : "pending"}`}><b>当前生效时间</b><span>{formatTime(negotiation.currentTime)}</span></div>
        {negotiation.candidateTimes.length > 0 && <div><b>候选时间</b><span>{negotiation.candidateTimes.map(formatTime).join("、")}</span></div>}
        {negotiation.override && <div><b>强制调整</b><span>{formatTime(negotiation.override.previousTime)} → {formatTime(negotiation.currentTime)}：{negotiation.override.reason}</span></div>}
      </div>
      <ul className="negotiation-responses">
        {negotiation.confirmations.map((item) => <li key={item.participantId} className={item.status}>
          <strong>{participantById.get(item.participantId)?.displayName ?? item.participantId}</strong>
          <span>{confirmLabels[item.status]}{item.note ? ` · ${item.note}` : ""}</span>
        </li>)}
      </ul>
      {proposal && <div className="proposal-box">
        <b>{participantById.get(proposal.requestedBy)?.displayName ?? proposal.requestedBy} 申请{proposal.type === "postpone" ? "顺延一周" : "更换开打时间"}{proposal.type === "postpone" ? `：${formatTime(proposal.proposedTimes[0])}` : ""}</b>
        {proposal.type === "change_time" && <ul className="proposal-times">
          {proposal.proposedTimes.map((time) => <li key={time}>
            <span>{formatTime(time)}</span>
            <em>{proposal.votes.filter((vote) => (vote.selectedTimes ?? []).includes(time)).map((vote) => participantById.get(vote.participantId)?.displayName ?? vote.participantId).join("、") || "暂无人选"}</em>
          </li>)}
        </ul>}
        <span>{proposal.votes.map((vote) => `${participantById.get(vote.participantId)?.displayName ?? vote.participantId} ${voteLabels[vote.status]}`).join("　")}</span>
      </div>}
      {!proposal && lastProposal && <p className="field-note">最近一条申请：{participantById.get(lastProposal.requestedBy)?.displayName ?? lastProposal.requestedBy} 申请{lastProposal.type === "postpone" ? "顺延" : "换时间"} → {lastProposal.status === "accepted" ? "已通过" : lastProposal.status === "rejected" ? "被拒绝（已回到法定时间确认）" : "表决中"}</p>}
      {negotiation.history.length > 0 && <ol className="negotiation-history">
        {[...negotiation.history].reverse().slice(0, 10).map((item, index) => <li key={`${item.at}-${index}`} className={item.tone ?? ""}>
          <b>{formatStamp(item.at)}</b>
          <span>{item.actor === "admin" ? "管理员" : participantById.get(item.actor)?.displayName ?? item.actor}：{item.detail}</span>
        </li>)}
      </ol>}
      {finished ? <p className="field-note">该桌牌谱已经录入，协商结束；如需重新安排请先删除该场牌谱。</p> : <div className="negotiation-forms">
        <form action={setNegotiationDeadlineAction}>
          <input type="hidden" name="competitionId" value={competition.id} />
          <input type="hidden" name="scheduleId" value={table.id} />
          <div className="negotiation-form-row">
            {[0, 1, 2].map((index) => <label key={index}>候选时间 {index + 1}<input name={`candidateTime${index}`} type="datetime-local" defaultValue={negotiation.candidateTimes[index] ? formatTableTimeInput(negotiation.candidateTimes[index]) : ""} /></label>)}
            <label>确认截止时间<input name="deadline" type="datetime-local" defaultValue={negotiation.deadline ? formatTableTimeInput(negotiation.deadline) : ""} /></label>
          </div>
          <button className="button" type="submit">保存协商设置</button>
        </form>
        <form action={overrideScheduleTimeAction}>
          <input type="hidden" name="competitionId" value={competition.id} />
          <input type="hidden" name="scheduleId" value={table.id} />
          <div className="negotiation-form-row">
            <label>强制调整到<input name="overrideTime" type="datetime-local" defaultValue={formatTableTimeInput(negotiation.currentTime)} required /></label>
            <label>原因（必填）<input name="overrideReason" type="text" placeholder="例如：场地临时不可用" required /></label>
          </div>
          <button className="button" type="submit">强制调整</button>
        </form>
        <form action={expireNegotiationAction}>
          <input type="hidden" name="competitionId" value={competition.id} />
          <input type="hidden" name="scheduleId" value={table.id} />
          <button className="button" type="submit">结束协商（按法定时间）</button>
        </form>
      </div>}
    </div>
  </details>;
}
