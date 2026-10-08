import Link from "next/link";
import { getCompetition } from "@/server/competition-repository";
import { currentNegotiationParticipant, readNegotiationSession } from "@/server/negotiation";
import { isAdmin } from "@/server/auth";
import { confirmedCount, formatTableTime, negotiationFor, negotiationStatusLabel, pendingProposal } from "@/domain/schedule-negotiation";
import { negotiationRules } from "@/domain/schedule-negotiation";
import { individualWeekOf } from "@/domain/individual-standings";
import { individualNegotiationOpensAt, individualNegotiationOpen } from "@/domain/individual-tournament";
import { individualSettingsFor } from "@/domain/competition-format";
import { scheduledMatch } from "@/domain/scheduled-match";
import { NegotiationPlayerForm } from "@/components/negotiation-player-form";
import type { PlayerFormState } from "@/components/negotiation-player-form";
import { LogIn, ShieldCheck } from "lucide-react";
import { leaveNegotiationSessionAction } from "./actions";

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
const stageLabels = { preliminary: "初赛", final: "决赛" } as const;
const responseLabels = { pending: "待确认", accepted: "已确认", declined: "不能参加" } as const;
const voteLabels = { pending: "待表决", accepted: "同意", declined: "拒绝" } as const;

/** 选手用赛场账号登录后进入赛程确认；没登录就先引导登录。 */
function Gate({ competitionId, competitionName, error }: { competitionId: string; competitionName: string; error: string }) {
  const next = `/negotiation?competition=${encodeURIComponent(competitionId)}`;
  return <div className="page form-page">
    <div className="page-heading">
      <div><p className="eyebrow">{competitionName} · 赛程确认</p><h1>用选手账号登录后确认赛程</h1>
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="form-section negotiation-gate">
      <Link className="button primary" href={`/login?next=${encodeURIComponent(next)}`}><LogIn size={16} />登录选手账号</Link>
      <p className="field-note">还没有账号或忘记密码，请联系赛事管理员重置。</p>
    </section>
  </div>;
}

/** 管理员没有选手身份，先让他选一个要代管的选手。 */
function AdminPicker({ competitionId, competitionName, participants }: { competitionId: string; competitionName: string; participants: Array<{ id: string; displayName: string }> }) {
  return <div className="page form-page">
    <div className="page-heading">
      <div><p className="eyebrow">{competitionName} · 赛程确认</p><h1>选择要代管的选手</h1>
        <p>可以以任意选手的身份查看赛程并代替他提交回应，操作会记录在协商历史里。</p></div>
    </div>
    <section className="form-section negotiation-gate">
      <ul className="negotiation-admin-picker">
        {participants.map((participant) => <li key={participant.id}>
          <Link className="button" href={`/negotiation?competition=${encodeURIComponent(competitionId)}&as=${encodeURIComponent(participant.id)}`}>
            <ShieldCheck size={15} />以 {participant.displayName} 的身份进入
          </Link>
        </li>)}
      </ul>
    </section>
  </div>;
}

export default async function NegotiationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const competitionId = typeof query.competition === "string" ? query.competition : "";
  const error = typeof query.error === "string" ? query.error : "";
  const done = typeof query.done === "string" ? query.done : "";
  const asParticipantId = typeof query.as === "string" ? query.as : "";
  const competition = competitionId ? await getCompetition(competitionId) : null;
  if (!competition) {
    return <div className="page form-page">
      <div className="page-heading"><div><p className="eyebrow">赛程确认</p><h1>找不到这场比赛</h1></div></div>
      <p className="form-error" role="alert">链接里的比赛不存在或已被删除，请找管理员确认协商链接。</p>
    </div>;
  }
  const [session, participant, admin] = await Promise.all([
    readNegotiationSession(competition.id),
    currentNegotiationParticipant(competition.id, asParticipantId || undefined),
    isAdmin(),
  ]);
  // 管理员没有选手会话：给他「代管哪位选手」的选择，而不是让他去登录选手账号。
  if (!participant && admin) return <AdminPicker competitionId={competition.id} competitionName={competition.name} participants={competition.participants} />;
  if (!participant) return <Gate competitionId={competition.id} competitionName={competition.name} error={error} />;
  const actingAs = admin && asParticipantId === participant.id;

  const participantById = new Map(competition.participants.map((item) => [item.id, item]));
  const myTables = (competition.individualSchedule ?? [])
    .filter((table) => table.participantIds.includes(participant.id))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
  const settings = individualSettingsFor(competition);
  // 时间窗：周三那两轮同周周一开放；周日那两轮等上一周周三打完再开放。
  const isOpen = (table: (typeof myTables)[number]) => !settings || individualNegotiationOpen(table, settings);
  const openTables = myTables.filter(isOpen);
  const recorded = (table: (typeof myTables)[number]) => Boolean(scheduledMatch(competition, table));
  const isSettled = (table: (typeof myTables)[number], negotiation: ReturnType<typeof negotiationFor>) =>
    recorded(table) || ["confirmed", "postponed", "legal_time_final", "completed", "cancelled"].includes(negotiation.status);
  const negotiable = openTables
    .filter((table) => !isSettled(table, negotiationFor(table)))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))[0];

  // 按周分组，方便折叠：默认展开「有需要处理的那一周」，其余收起。
  const weeks = [...new Set(myTables.map((table) => individualWeekOf(table)))].sort((left, right) => left - right);
  const activeWeek = negotiable ? individualWeekOf(negotiable) : weeks[0];

  return <div className="page form-page">
    <div className="page-heading">
      <div>
        <p className="eyebrow">{competition.name} · 赛程确认{actingAs ? " · 管理员代管" : ""}</p>
        <h1>{participant.displayName} 的赛程</h1>
      </div>
      {actingAs
        ? <div className="heading-actions"><Link className="button" href={`/negotiation?competition=${encodeURIComponent(competition.id)}`}>换一个选手</Link></div>
        : session
        ? <form action={leaveNegotiationSessionAction} className="heading-actions">
          <input type="hidden" name="competitionId" value={competition.id} />
          <button className="button" type="submit">切换选手</button>
        </form>
        : <div className="heading-actions"><Link className="button" href="/login?next=/casual">切换账号</Link></div>}
    </div>
    {done && <p className="form-message success" role="status">已提交，下面是你的赛程。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!myTables.length && <section className="form-section"><div className="form-section-title"><span>1</span><div><h2>你还没有排到桌次</h2></div></div></section>}
    {weeks.map((week) => {
      const weekTables = myTables.filter((table) => individualWeekOf(table) === week);
      const weekOpen = weekTables.some(isOpen);
      const weekDone = weekTables.every((table) => isSettled(table, negotiationFor(table)));
      return <details className="negotiation-week" key={week} open={week === activeWeek || !weekDone} id={`week-${week}`}>
        <summary>
          <strong>{stageLabels[weekTables[0].stage]} · 第 {week} 周</strong>
          <span className={`negotiation-week-state ${weekOpen ? (weekDone ? "done" : "open") : "locked"}`}>
            {weekDone ? "已完成" : weekOpen ? "可协商" : "未开放"}
          </span>
          <span className="negotiation-week-count">{weekTables.length} 场</span>
        </summary>
        <div className="negotiation-week-body">
    {weekTables.map((table, index) => {
      const negotiation = negotiationFor(table);
      const proposal = pendingProposal(negotiation);
      const open = isOpen(table);
      const opensAt = settings ? individualNegotiationOpensAt(table, settings) : null;
      const isNegotiable = open && negotiable?.id === table.id;
      const finished = recorded(table);
      const status = finished ? "已完成" : negotiationStatusLabel(negotiation);
      const myVote = proposal?.votes.find((vote) => vote.participantId === participant.id);
      const myConfirmation = negotiation.confirmations.find((item) => item.participantId === participant.id);
      const settledTime = finished || ["confirmed", "postponed"].includes(negotiation.status);
      const pendingConfirmations = negotiation.confirmations.filter((item) => item.status === "pending").length;
      const pendingVotes = proposal?.votes.filter((vote) => vote.status === "pending").length ?? 0;
      const proposalName = proposal?.type === "postpone" ? "顺延一周" : "更换开打时间";
      const formState: PlayerFormState = finished
        ? "finished"
        : !open
          ? "locked_until_open"
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
          <h2>{stageLabels[table.stage]} · 第 {individualWeekOf(table)} 周 · 第 {table.round} 轮 · A{table.tableNumber} <em className={`negotiation-status ${negotiation.status === "confirmed" || negotiation.status === "postponed" ? "confirmed" : negotiation.status === "legal_time_final" || negotiation.status === "overdue" ? "final" : "pending"}`}>{status}</em></h2>
        </div></div>
        <div className="negotiation-times">
          <div><b>法定时间</b><span>{formatTime(negotiation.legalTime)}</span></div>
          <div className={`current-time ${settledTime ? "settled" : "pending"}`}><b>当前生效时间</b><span>{formatTime(negotiation.currentTime)}</span></div>
          {negotiation.deadline && <div><b>确认截止</b><span>{formatTime(negotiation.deadline)}</span></div>}
          {negotiation.override && <div><b>管理员调整</b><span>{formatTime(negotiation.override.previousTime)} → {formatTime(negotiation.currentTime)}：{negotiation.override.reason}</span></div>}
        </div>
        <ul className="negotiation-responses">
          {negotiation.confirmations.map((item) => <li key={item.participantId} className={`${item.status}${item.participantId === participant.id ? " mine" : ""}`}>
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
            asParticipantId={actingAs ? participant.id : undefined}
            state={formState}
            hint={formHint}
            proposalType={proposal ? proposal.type : null}
            proposedTimes={proposal?.proposedTimes ?? []}
            myVoteStatus={myVote?.status === "accepted" || myVote?.status === "declined" ? myVote.status : null}
            canPostpone={!negotiation.postponed && !negotiation.postponeBlocked}
            postponeBlockedReason={negotiation.postponed ? "本场已经顺延过" : negotiation.postponeBlocked ? "本场顺延申请曾被拒绝" : ""}
            legalTime={negotiation.legalTime}
            onlyEarlier={negotiationRules(negotiation).onlyEarlier}
            noPostpone={negotiationRules(negotiation).noPostpone}
            opensAtLabel={opensAt ? formatStamp(opensAt) : undefined}
          />
          : !finished && open && <p className={`field-note confirmed-count ${confirmedCount(negotiation) >= 4 ? "all" : ""}`}>{proposal && myVote?.status === "pending" ? "这一场也有待表决的申请，但请先处理上面最近的那一场。" : `已确认 ${confirmedCount(negotiation)}/4，本桌暂不需要你操作。`}</p>}
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
        </div>
      </details>;
    })}
  </div>;
}
