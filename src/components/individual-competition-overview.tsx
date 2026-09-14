import Link from "next/link";
import { ArrowLeft, BarChart3, Diamond, FilePlus2, Medal, Pencil, Settings } from "lucide-react";
import type { Competition } from "@/domain/types";
import { individualSettingsFor } from "@/domain/competition-format";
import { assessMatchQuality } from "@/domain/match-quality";
import type { CompetitionSummary } from "@/server/competition-statistics";
import { totalsForCompetition } from "@/data/competition";
import { PlayerTag } from "@/components/player-tag";
import { StatusPill } from "@/components/status-pill";
import { individualStageStandings } from "@/domain/individual-standings";
import { scheduledMatch } from "@/domain/scheduled-match";
import styles from "./competition-overview.module.css";

const stageLabels = { preliminary: "初赛", semifinal: "半决赛", final: "决赛" } as const;
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function QualityBadges({ competition, matchNumber }: { competition: Competition; matchNumber: number }) {
  const match = competition.matches.find((item) => item.matchNumber === matchNumber);
  if (!match) return null;
  const quality = assessMatchQuality(match);
  return <>
    {quality.matchQuality === "diamond" && <span className={styles.diamondBadge}><Diamond size={12} />钻石局</span>}
    {quality.matchQuality === "gold" && <span className={styles.goldBadge}><Medal size={12} />金分局</span>}
    {quality.fourHorses && <span className={styles.horseBadge}>四马献福</span>}
  </>;
}

export function IndividualCompetitionOverview({ competition, summary, showBackLink = false, admin }: {
  competition: Competition;
  summary: CompetitionSummary;
  showBackLink?: boolean;
  admin: boolean;
}) {
  const totals = totalsForCompetition(competition);
  const completed = competition.matches.filter((match) => match.status === "completed").length;
  const settings = individualSettingsFor(competition);
  const plannedTables = competition.individualSchedule ?? [];
  const stageOrder = ["final", "semifinal", "preliminary"] as const;
  const eliminated = new Set<string>();
  for (const stage of ["preliminary", "semifinal"] as const) {
    if (!competition.matches.some((match) => match.status === "completed" && match.stage === stage)) continue;
    const stageMatches = competition.matches.filter((match) => match.status === "completed" && match.stage === stage);
    const advancing = individualStageStandings(competition, stage).filter((row) => row.advancing).map((row) => row.participant.id);
    const stagePlayers = new Set(stageMatches.flatMap((match) => match.seats.map((seat) => seat.participantId)));
    if (advancing.length > 0) stagePlayers.forEach((participantId) => { if (!advancing.includes(participantId)) eliminated.add(participantId); });
  }
  const currentStage = (participantId: string) => {
    if (eliminated.has(participantId)) return "已淘汰";
    if (competition.matches.some((match) => match.stage === "final" && match.seats.some((seat) => seat.participantId === participantId))) return "决赛";
    if (competition.matches.some((match) => match.stage === "semifinal" && match.seats.some((seat) => seat.participantId === participantId))) return "半决赛";
    return "初赛";
  };
  const sortedPlayers = [...competition.participants].sort((left, right) => (totals[right.id] ?? 0) - (totals[left.id] ?? 0));
  return <div className="page competition-page">
    {showBackLink && <Link className="back-link" href="/"><ArrowLeft size={16} />返回比赛列表</Link>}
    <div className="page-heading">
      <div><p className="eyebrow">{competition.code} · 个人赛</p><h1>{competition.name}</h1><p>{competition.status === "draft" ? "草稿" : competition.status === "active" ? "进行中" : competition.status === "completed" ? "已完成" : "已归档"} · {competition.participants.length} 名选手 · {completed} 场</p></div>
      {admin && <div className="heading-actions"><Link className="button" href={`/competitions/${competition.id}/settings`}><Settings size={17} />比赛设置</Link>{competition.matches.length > 0 && <Link className="button" href={`/competitions/${competition.id}/data`}><BarChart3 size={17} />查看数据</Link>}</div>}
    </div>
    <section className="standings">
      <div className="section-heading"><div><h2>个人积分榜</h2></div></div>
      <div className="table-wrap"><table className="match-table individual-standings-table"><thead><tr><th>排名</th><th>选手</th><th>积分</th><th>已打半庄</th><th>平均顺位</th><th>状态</th></tr></thead><tbody>{sortedPlayers.map((participant, index) => { const status = currentStage(participant.id); const statusClass = status === "决赛" ? "stage-final" : status === "半决赛" ? "stage-semifinal" : status === "初赛" ? "stage-preliminary" : "stage-eliminated"; return <tr className={status === "已淘汰" ? "eliminated-standing-row" : ""} key={participant.id}><td><strong>{index + 1}</strong></td><td><PlayerTag participant={participant} /></td><td className={(totals[participant.id] ?? 0) >= 0 ? "positive" : "negative"}>{(totals[participant.id] ?? 0) >= 0 ? "+" : ""}{(totals[participant.id] ?? 0).toFixed(1)}</td><td>{summary[participant.id]?.["对局数"] ?? 0}</td><td>{summary[participant.id]?.["平均顺位"]?.toFixed(2) ?? "-"}</td><td><span className={`stage-status ${statusClass}`}>{status}</span></td></tr>; })}</tbody></table></div>
    </section>
    <section className="section-block">
      <div className="section-heading"><div><h2>赛程</h2></div><span className="table-count">{completed} 场已完成</span></div>
      {settings && <ul className="workflow"><li><b>1</b><div><strong>初赛</strong><small>{settings.stages.preliminary.matchCountPerPlayer} 半庄/人{(settings.stages.preliminary.advancingPlayerCount ?? 0) > 0 ? ` · ${settings.stages.preliminary.advancingPlayerCount} 人晋级半决赛` : ""}{(settings.preliminaryDirectFinalPlayerCount ?? 0) > 0 ? ` · ${settings.preliminaryDirectFinalPlayerCount} 人直通决赛` : ""}</small></div></li><li><b>2</b><div><strong>半决赛</strong><small>{settings.stages.semifinal.matchCountPerPlayer} 半庄/人{(settings.semifinalAdvancingPlayerCount ?? settings.stages.semifinal.advancingPlayerCount ?? 0) > 0 ? ` · ${settings.semifinalAdvancingPlayerCount ?? settings.stages.semifinal.advancingPlayerCount} 人晋级决赛` : ""}</small></div></li><li><b>3</b><div><strong>决赛</strong><small>{settings.stages.final.matchCountPerPlayer} 半庄/人</small></div></li></ul>}
      <h3>待开赛</h3>
      {stageOrder.map((stage) => {
        const stageTables = plannedTables.filter((table) => table.stage === stage && table.status !== "cancelled");
        const pending = stageTables.filter((table) => table.status !== "completed" && !scheduledMatch(competition, table));
        if (stageTables.length && !pending.length) return null;
        return <section className="schedule-stage-group" key={stage}>
          <h4>{stageLabels[stage]}</h4>
          {pending.length ? <div className="individual-schedule-grid">{pending.map((table) =>
            <article className="individual-schedule-card" key={table.id}>
              <header><strong>{dateFormatter.format(new Date(table.scheduledAt))}</strong><span>{stageLabels[stage]} · 第 {table.round} 轮 · A{table.tableNumber}</span></header>
              <div className="individual-schedule-players">{table.participantIds.map((id) => {
                const participant = competition.participants.find((item) => item.id === id);
                return <span style={{ "--player-color": participant?.color } as React.CSSProperties} key={id}>{participant?.displayName ?? id}</span>;
              })}</div>
              <footer>{admin ? <Link className="button primary" href={`/competitions/${competition.id}/matches/new?scheduleId=${encodeURIComponent(table.id)}`}>录入牌谱</Link> : <span>待开赛</span>}</footer>
            </article>
          )}</div> : <article className="individual-schedule-card schedule-pending-card"><header><strong>{stageLabels[stage]}</strong></header><div className="schedule-pending-label">待定中...</div></article>}
        </section>;
      })}
      {completed > 0 && <><h3>已完成</h3>{stageOrder.map((stage) => {
        const matches = competition.matches.filter((match) => match.status === "completed" && match.stage === stage)
          .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || b.matchNumber - a.matchNumber);
        return matches.length ? <section className="schedule-stage-group" key={stage}>
          <h4>{stageLabels[stage]}</h4>
          <div className="individual-schedule-grid">{matches.map((match) => {
            const table = plannedTables.find((item) => scheduledMatch(competition, item)?.id === match.id);
            return <article className="individual-schedule-card schedule-completed" key={match.id}>
              <header><strong>{dateFormatter.format(new Date(table?.scheduledAt ?? match.playedAt))}</strong><span>{stageLabels[stage]} · 第 {match.round ?? 1} 轮 · A{match.tableNumber ?? "-"}</span></header>
              <div className="individual-schedule-players">{match.seats.map((seat) => {
                const participant = competition.participants.find((item) => item.id === seat.participantId);
                return <span style={{ "--player-color": participant?.color } as React.CSSProperties} key={seat.seat}>{participant?.displayName || seat.sourceUsername}</span>;
              })}</div>
              <footer><strong className="schedule-done">已录入牌谱</strong><Link className="table-edit-link" href={`/competitions/${competition.id}/matches/${match.matchNumber}`}><Pencil size={14} />查看</Link></footer>
            </article>;
          })}</div>
        </section> : null;
      })}</>}
      <Link className="button" href={`/competitions/${competition.id}/matches`}>查看牌谱记录</Link>
    </section>
  </div>;
}

export function IndividualCompetitionData({ competition, summary }: { competition: Competition; summary: CompetitionSummary }) {
  const rateLabel = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`;
  const totals = totalsForCompetition(competition);
  const sortedPlayers = [...competition.participants].sort((left, right) => (totals[right.id] ?? 0) - (totals[left.id] ?? 0));
  return <section className="section-block">
    <div className="section-heading"><div><h2>个人赛数据总览</h2></div><span className="table-count">{sortedPlayers.length} 人</span></div>
    <div className="table-wrap"><table className="match-table"><thead><tr><th>排名</th><th>选手</th><th>累计积分</th><th>半庄数</th><th>平均顺位</th><th>顺位分布</th><th>平均 Rating</th><th>和率</th><th>铳率</th><th>详细数据</th></tr></thead><tbody>{sortedPlayers.map((participant, index) => { const rankCounts = [1, 2, 3, 4].map((rank) => competition.matches.reduce((count, match) => count + (match.seats.find((seat) => seat.participantId === participant.id)?.rank === rank ? 1 : 0), 0)); const ratings = competition.matches.flatMap((match) => (match.nagaRatings ?? []).filter((rating) => match.seats.find((seat) => seat.participantId === participant.id)?.seat === Number(rating.participantId)).map((rating) => rating.rating)); const averageRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null; return <tr key={participant.id}><td><strong>{index + 1}</strong></td><td><PlayerTag participant={participant} /></td><td className={(totals[participant.id] ?? 0) >= 0 ? "positive" : "negative"}>{(totals[participant.id] ?? 0) >= 0 ? "+" : ""}{(totals[participant.id] ?? 0).toFixed(1)}</td><td>{summary[participant.id]?.["对局数"] ?? 0}</td><td>{summary[participant.id]?.["平均顺位"]?.toFixed(2) ?? "-"}</td><td>{rankCounts.join(" / ")}</td><td>{averageRating?.toFixed(1) ?? "-"}</td><td>{rateLabel(summary[participant.id]?.["和牌率"])}</td><td>{rateLabel(summary[participant.id]?.["放铳率"])}</td><td><Link className="table-edit-link" href={`/competitions/${competition.id}/data/${participant.id}`}>详细数据</Link></td></tr>; })}</tbody></table></div>
    {(["preliminary", "semifinal", "final"] as const).map((stage) => { const rows = individualStageStandings(competition, stage); return <div className="table-wrap" key={stage}><h3>{stageLabels[stage]}积分榜</h3><table className="match-table"><thead><tr><th>排名</th><th>选手</th><th>积分</th><th>半庄数</th><th>平均顺位</th><th>晋级</th></tr></thead><tbody>{rows.map((row) => <tr key={row.participant.id}><td><strong>{row.rank}</strong></td><td><PlayerTag participant={row.participant} /></td><td>{row.points >= 0 ? "+" : ""}{row.points.toFixed(1)}</td><td>{row.games}</td><td>{row.averageRank?.toFixed(2) ?? "-"}</td><td>{row.advancing ? "晋级" : "-"}</td></tr>)}</tbody></table></div>; })}
  </section>;
}
