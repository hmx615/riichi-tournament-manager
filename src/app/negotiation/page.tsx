import { getCompetition } from "@/server/competition-repository";
import { readNegotiationSession } from "@/server/negotiation";
import { confirmedCount, formatTableTime, negotiationFor, negotiationStatusLabel, pendingProposal } from "@/domain/schedule-negotiation";
import { NegotiationPlayerForm } from "@/components/negotiation-player-form";
import type { PlayerFormState } from "@/components/negotiation-player-form";
import { leaveNegotiationSessionAction, startNegotiationSessionAction } from "./actions";

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
const stageLabels = { preliminary: "初赛", semifinal: "半决赛", final: "决赛" } as const;
const responseLabels = { pending: "待确认", accepted: "已确认", declined: "不能参加" } as const;
const voteLabels = { pending: "待表决", accepted: "同意", declined: "拒绝" } as const;

function Gate({ competitionId, competitionName, error }: { competitionId: string; competitionName: string; error: string }) {
  return <div className="page form-page">
    <div className="page-heading">
      <div><p className="eyebrow">{competitionName} · 赛程确认</p><h1>输入口令进入我的赛程</h1>
        <p>口令由管理员发给本人，一条口令本届通用；验证通过后本届比赛内不用再输。</p></div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <form className="form-section negotiation-gate" action={startNegotiationSessionAction}>
      <input type="hidden" name="competitionId" value={competitionId} />
      <label>8 位口令<input name="accessCode" inputMode="numeric" autoComplete="one-time-code" pattern="\d{8}" maxLength={8} placeholder="例如 20260916" required /></label>
      <button className="button primary" type="submit">进入我的赛程</button>
    </form>
  </div>;
}

export default async function NegotiationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const competitionId = typeof query.competition === "string" ? query.competition : "";
  const error = typeof query.error === "string" ? query.error : "";
  const done = typeof query.done === "string" ? query.done : "";
  const competition = competitionId ? await getCompetition(competitionId) : null;
  if (!competition) {
    return <div className="page form-page">
      <div className="page-heading"><div><p className="eyebrow">赛程确认</p><h1>找不到这场比赛</h1></div></div>
      <p className="form-error" role="alert">链接里的比赛不存在或已被删除，请找管理员确认协商链接。</p>
    </div>;
  }
  const session = await readNegotiationSession(competition.id);
  if (!session) return <Gate competitionId={competition.id} competitionName={competition.name} error={error} />;
  const participant = competition.participants.find((item) => item.id === session.participantId);
  if (!participant) return <Gate competitionId={competition.id} competitionName={competition.name} error="口令对应的选手已经不在本届名单里，请联系管理员" />;

  const participantById = new Map(competition.participants.map((item) => [item.id, item]));
  const myTables = (competition.individualSchedule ?? [])
    .filter((table) => table.participantIds.includes(participant.id))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
  const recorded = (tableId: string, stage: string, round: number, tableNumber: number) => competition.matches.some((match) =>
    match.scheduleId === tableId || (match.stage === stage && match.round === round && match.tableNumber === tableNumber));
  const isSettled = (tableId: string, stage: string, round: number, tableNumber: number, negotiation: ReturnType<typeof negotiationFor>) =>
    recorded(tableId, stage, round, tableNumber) || ["confirmed", "postponed", "legal_time_final", "completed", "cancelled"].includes(negotiation.status);
  const negotiable = myTables
    .filter((table) => !isSettled(table.id, table.stage, table.round, table.tableNumber, negotiationFor(table)))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))[0];

  return <div className="page form-page">
    <div className="page-heading">
      <div>
        <p className="eyebrow">{competition.name} · 赛程确认</p>
        <h1>{participant.displayName} 的赛程</h1>
        <p>时间均为北京时间（Asia/Shanghai）· 每次只放开最近的一场协商，其余桌次供查看</p>
      </div>
      <form action={leaveNegotiationSessionAction} className="heading-actions">
        <input type="hidden" name="competitionId" value={competition.id} />
        <button className="button" type="submit">切换选手（清除口令）</button>
      </form>
    </div>
    {done && <p className="form-message success" role="status">已提交，下面是你的赛程。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!myTables.length && <section className="form-section"><div className="form-section-title"><span>1</span><div><h2>你还没有排到桌次</h2></div></div></section>}
    {myTables.map((table, index) => {
      const negotiation = negotiationFor(table);
      const proposal = pendingProposal(negotiation);
      const isNegotiable = negotiable?.id === table.id;
      const finished = recorded(table.id, table.stage, table.round, table.tableNumber);
      const status = finished ? "已完成" : negotiationStatusLabel(negotiation);
      const myVote = proposal?.votes.find((vote) => vote.participantId === participant.id);
      const myConfirmation = negotiation.confirmations.find((item) => item.participantId === participant.id);
      const settledTime = finished || ["confirmed", "postponed"].includes(negotiation.status);
      const pendingConfirmations = negotiation.confirmations.filter((item) => item.status === "pending").length;
      const pendingVotes = proposal?.votes.filter((vote) => vote.status === "pending").length ?? 0;
      const proposalName = proposal?.type === "postpone" ? "顺延一周" : "更换开打时间";
      const formState: PlayerFormState = finished
        ? "finished"
        : proposal
          ? proposal.requestedBy === participant.id
            ? "proposer_waiting"
            : myVote?.status === "pending"
              ? "needs_vote"
              : "voted"
          : ["confirmed", "postponed", "legal_time_final", "cancelled"].includes(negotiation.status)
            ? "settled"
            : myConfirmation?.status === "pending" ? "needs_action" : "confirmed_waiting";
      const formHint = formState === "proposer_waiting"
        ? `你已经提交了${proposalName}的申请，正在等另外 ${pendingVotes} 人表决。`
        : formState === "voted"
          ? `你已经${myVote?.status === "accepted" ? "同意" : "拒绝"}了这次${proposalName}的申请，正在等另外 ${pendingVotes} 人表决。`
          : formState === "confirmed_waiting"
            ? `你已经确认可以参加法定时间，正在等另外 ${pendingConfirmations} 人确认；如需改动可以点「修改我的回应」。`
            : formState === "settled"
              ? `本桌时间已确定：${negotiation.status === "postponed" ? `顺延到 ${formatTime(negotiation.currentTime)}` : formatTime(negotiation.currentTime)}；如需调整请联系管理员。`
              : formState === "finished"
                ? "本桌牌谱已经录入，协商结束。"
                : "";
      return <section className={`form-section negotiation-player-section${isNegotiable ? " negotiable" : ""}`} id={`table-${table.id}`} key={table.id}>
        <div className="form-section-title"><span>{index + 1}</span><div>
          <h2>{stageLabels[table.stage]} · 第 {table.round} 轮 · A{table.tableNumber} <em className={`negotiation-status ${negotiation.status === "confirmed" || negotiation.status === "postponed" ? "confirmed" : negotiation.status === "legal_time_final" || negotiation.status === "overdue" ? "final" : "pending"}`}>{status}</em></h2>
          <p>本桌：{table.participantIds.map((id) => participantById.get(id)?.displayName ?? id).join("、")}{isNegotiable ? " · 现在需要你处理这一场" : ""}</p>
        </div></div>
        <div className="negotiation-times">
          <div><b>法定时间</b><span>{formatTime(negotiation.legalTime)}</span></div>
          <div className={`current-time ${settledTime ? "settled" : "pending"}`}><b>当前生效时间</b><span>{formatTime(negotiation.currentTime)}</span></div>
          {negotiation.deadline && <div><b>确认截止</b><span>{formatTime(negotiation.deadline)}</span></div>}
          {negotiation.override && <div><b>管理员调整</b><span>{formatTime(negotiation.override.previousTime)} → {formatTime(negotiation.currentTime)}：{negotiation.override.reason}</span></div>}
        </div>
        <ul className="negotiation-responses">
          {negotiation.confirmations.map((item) => <li key={item.participantId} className={item.status}>
            <strong>{participantById.get(item.participantId)?.displayName ?? item.participantId}{item.participantId === participant.id ? "（我）" : ""}</strong>
            <span>{responseLabels[item.status]}{item.note ? ` · ${item.note}` : ""}</span>
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
          {proposal.note && <em>申请人说明：{proposal.note}</em>}
        </div>}
        {isNegotiable
          ? <NegotiationPlayerForm
            competitionId={competition.id}
            scheduleId={table.id}
            state={formState}
            hint={formHint}
            proposalType={proposal ? proposal.type : null}
            proposedTimes={proposal?.proposedTimes ?? []}
            myVoteStatus={myVote?.status === "accepted" || myVote?.status === "declined" ? myVote.status : null}
            canPostpone={!negotiation.postponed && !negotiation.postponeBlocked}
            postponeBlockedReason={negotiation.postponed ? "本场已经顺延过" : negotiation.postponeBlocked ? "本场顺延申请曾被拒绝" : ""}
          />
          : !finished && <p className={`field-note confirmed-count ${confirmedCount(negotiation) >= 4 ? "all" : ""}`}>{proposal && myVote?.status === "pending" ? "这一场也有待表决的申请，但请先处理上面最近的那一场。" : `已确认 ${confirmedCount(negotiation)}/4，本桌暂不需要你操作。`}</p>}
        {negotiation.history.length > 0 && <details className="negotiation-player-history">
          <summary>查看本桌协商记录（{negotiation.history.length} 条）</summary>
          <ol className="negotiation-history">
            {[...negotiation.history].reverse().map((item, position) => <li key={`${item.at}-${position}`} className={item.tone ?? ""}>
              <b>{formatStamp(item.at)}</b>
              <span>{item.actor === "admin" ? "管理员" : participantById.get(item.actor)?.displayName ?? item.actor}：{item.detail}</span>
            </li>)}
          </ol>
        </details>}
      </section>;
    })}
  </div>;
}
