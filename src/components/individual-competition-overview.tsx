import Link from "next/link";
import { ArrowLeft, BarChart3, Diamond, FilePlus2, Medal, Pencil, Settings } from "lucide-react";
import type { Competition } from "@/domain/types";
import { individualSettingsFor } from "@/domain/competition-format";
import { assessMatchQuality } from "@/domain/match-quality";
import type { CompetitionSummary } from "@/server/competition-statistics";
import { totalsForCompetition } from "@/data/competition";
import { PlayerTag } from "@/components/player-tag";
import { StatusPill } from "@/components/status-pill";
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
  const sortedPlayers = [...competition.participants].sort((left, right) => (totals[right.id] ?? 0) - (totals[left.id] ?? 0));
  return <div className="page competition-page">
    {showBackLink && <Link className="back-link" href="/"><ArrowLeft size={16} />返回比赛列表</Link>}
    <div className="page-heading">
      <div><p className="eyebrow">{competition.code} · 个人赛</p><h1>{competition.name}</h1><p>{competition.status === "draft" ? "草稿" : competition.status === "active" ? "进行中" : competition.status === "completed" ? "已完成" : "已归档"} · {competition.participants.length} 名选手 · {completed} 场</p></div>
      {admin && <div className="heading-actions"><Link className="button" href={`/competitions/${competition.id}/settings`}><Settings size={17} />比赛设置</Link>{competition.matches.length > 0 && <Link className="button" href={`/competitions/${competition.id}/data`}><BarChart3 size={17} />查看数据</Link>}<Link className="button primary" href={`/competitions/${competition.id}/matches/new`}><FilePlus2 size={17} />录入牌谱</Link></div>}
    </div>
    <section className="standings">
      <div className="section-heading"><div><h2>个人积分榜</h2><p className="section-note">按累计赛事积分排序</p></div></div>
      <div className="table-wrap"><table className="match-table individual-standings-table"><thead><tr><th>排名</th><th>选手</th><th>积分</th><th>已打半庄</th><th>平均顺位</th></tr></thead><tbody>{sortedPlayers.map((participant, index) => <tr key={participant.id}><td><strong>{index + 1}</strong></td><td><PlayerTag participant={participant} /></td><td className={(totals[participant.id] ?? 0) >= 0 ? "positive" : "negative"}>{(totals[participant.id] ?? 0) >= 0 ? "+" : ""}{(totals[participant.id] ?? 0).toFixed(1)}</td><td>{summary[participant.id]?.["对局数"] ?? 0}</td><td>{summary[participant.id]?.["平均顺位"]?.toFixed(2) ?? "-"}</td></tr>)}</tbody></table></div>
    </section>
    <section className="section-block">
      <div className="section-heading"><div><h2>赛程与牌谱</h2><p className="section-note">按阶段、轮次和桌次记录</p></div><span className="table-count">{completed} 场</span></div>
      {settings && <ul className="workflow"><li><b>1</b><div><strong>初赛</strong><small>{settings.stages.preliminary.matchCountPerPlayer} 半庄/人</small></div></li><li><b>2</b><div><strong>半决赛</strong><small>{settings.stages.semifinal.matchCountPerPlayer} 半庄/人</small></div></li><li><b>3</b><div><strong>决赛</strong><small>{settings.stages.final.matchCountPerPlayer} 半庄/人</small></div></li></ul>}
      {competition.matches.length === 0 ? <div className="empty-schedule"><FilePlus2 size={24} /><h2>尚未录入对局</h2></div> : <div className="table-wrap"><table className="match-table"><thead><tr><th>场次</th><th>阶段</th><th>时间</th><th>桌次</th><th>座次与结果</th><th>状态</th>{admin && <th><span className="sr-only">操作</span></th>}</tr></thead><tbody>{[...competition.matches].sort((a, b) => b.matchNumber - a.matchNumber).map((match) => <tr key={match.id}><td><div className={styles.matchNumber}><strong>#{match.matchNumber}</strong><QualityBadges competition={competition} matchNumber={match.matchNumber} /></div></td><td>{match.stage ? stageLabels[match.stage] : "-"}{match.round ? ` · 第 ${match.round} 轮` : ""}</td><td>{dateFormatter.format(new Date(match.playedAt))}</td><td>{match.tableNumber ? `A${match.tableNumber}` : "-"}</td><td><div className="seat-result">{[...match.seats].sort((a, b) => a.rank - b.rank).map((seat) => <span key={seat.seat}><b>{seat.rank}</b><em>{competition.participants.find((participant) => participant.id === seat.participantId)?.displayName || seat.sourceUsername}</em><small className={seat.competitionPoints >= 0 ? "positive" : "negative"}>{seat.competitionPoints >= 0 ? "+" : ""}{seat.competitionPoints.toFixed(1)}</small></span>)}</div></td><td><StatusPill status={match.status} /></td>{admin && <td><Link className="table-edit-link" href={`/competitions/${competition.id}/matches/${match.matchNumber}`}><Pencil size={14} />修改对局</Link></td>}</tr>)}</tbody></table></div>}
    </section>
  </div>;
}

export function IndividualCompetitionData({ competition, summary }: { competition: Competition; summary: CompetitionSummary }) {
  const totals = totalsForCompetition(competition);
  const sortedPlayers = [...competition.participants].sort((left, right) => (totals[right.id] ?? 0) - (totals[left.id] ?? 0));
  return <section className="section-block">
    <div className="section-heading"><div><h2>个人赛积分榜</h2><p className="section-note">完整参赛名单与当前累计成绩</p></div><span className="table-count">{sortedPlayers.length} 人</span></div>
    <div className="table-wrap"><table className="match-table"><thead><tr><th>排名</th><th>选手</th><th>累计积分</th><th>半庄数</th><th>平均顺位</th><th>顺位分布</th></tr></thead><tbody>{sortedPlayers.map((participant, index) => { const rankCounts = [1, 2, 3, 4].map((rank) => competition.matches.reduce((count, match) => count + (match.seats.find((seat) => seat.participantId === participant.id)?.rank === rank ? 1 : 0), 0)); return <tr key={participant.id}><td><strong>{index + 1}</strong></td><td><PlayerTag participant={participant} /></td><td className={(totals[participant.id] ?? 0) >= 0 ? "positive" : "negative"}>{(totals[participant.id] ?? 0) >= 0 ? "+" : ""}{(totals[participant.id] ?? 0).toFixed(1)}</td><td>{summary[participant.id]?.["对局数"] ?? 0}</td><td>{summary[participant.id]?.["平均顺位"]?.toFixed(2) ?? "-"}</td><td>{rankCounts.join(" / ")}</td></tr>; })}</tbody></table></div>
  </section>;
}
