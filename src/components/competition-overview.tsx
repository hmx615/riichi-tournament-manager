import Link from "next/link";
import { ArrowLeft, BarChart3, Diamond, ExternalLink, FilePlus2, Medal, Pencil, Settings } from "lucide-react";
import type { Competition } from "@/domain/types";
import { matchQuality } from "@/domain/match-quality";
import type { CompetitionSummary } from "@/server/competition-statistics";
import { totalsForCompetition } from "@/data/competition";
import { PlayerTag } from "@/components/player-tag";
import { StatusPill } from "@/components/status-pill";
import styles from "./competition-overview.module.css";

const wind = ["东", "南", "西", "北"];
const competitionStatus = { draft: "草稿", active: "进行中", completed: "已完成", archived: "已归档" };
const matchDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function CompetitionOverview({ competition, summary, showBackLink = false, admin }: {
  competition: Competition;
  summary: CompetitionSummary;
  showBackLink?: boolean;
  admin: boolean;
}) {
  const totals = totalsForCompetition(competition);
  const completed = competition.matches.filter((match) => match.status === "completed").length;
  const participantById = Object.fromEntries(competition.participants.map((participant) => [participant.id, participant]));
  const sortedPlayers = [...competition.participants].sort((left, right) => totals[right.id] - totals[left.id]);
  return (
    <div className="page competition-page">
      {showBackLink && <Link className="back-link" href="/"><ArrowLeft size={16} />返回比赛列表</Link>}
      <div className="page-heading">
        <div><p className="eyebrow">{competition.code}</p><h1>{competition.name}</h1><p>{competitionStatus[competition.status]} · {completed}/{competition.plannedMatchCount}半庄</p></div>
        {admin && <div className="heading-actions">
          <Link className="button" href={`/competitions/${competition.id}/settings`}><Settings size={17} />比赛设置</Link>
          {competition.matches.length > 0 && <Link className="button" href={`/competitions/${competition.id}/data`}><BarChart3 size={17} />查看数据</Link>}
          <Link className="button primary" href={`/competitions/${competition.id}/matches/new`}><FilePlus2 size={17} />录入牌谱</Link>
        </div>}
      </div>
      <section className="standings">
        <div className="section-heading"><div><h2>积分榜</h2></div></div>
        <div className="standings-grid">
          {sortedPlayers.map((participant, index) => (
            <article className="standing" key={participant.id} style={{ "--player-color": participant.color } as React.CSSProperties}>
              <span className="standing-rank">{index + 1}</span>
              <PlayerTag participant={participant} />
              <strong className={totals[participant.id] >= 0 ? "positive" : "negative"}>{totals[participant.id] >= 0 ? "+" : ""}{totals[participant.id].toFixed(1)}</strong>
              <small>平均顺位 {summary[participant.id]?.["平均顺位"]?.toFixed(2) ?? "-"}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading"><div><h2>赛程与牌谱</h2></div><span className="table-count">{competition.matches.length} 场</span></div>
        {competition.matches.length === 0 ? (
          <div className="empty-schedule"><FilePlus2 size={24} /><h2>尚未录入对局</h2></div>
        ) : (
          <div className="table-wrap">
            <table className="match-table">
              <thead><tr><th>场次</th><th>时间</th><th>状态</th><th>座次与结果</th><th>数据源</th>{admin && <th><span className="sr-only">操作</span></th>}</tr></thead>
              <tbody>{[...competition.matches].reverse().map((match) => {
                const quality = matchQuality(match);
                return <tr key={match.id}>
                  <td><div className={styles.matchNumber}><strong>#{match.matchNumber}</strong>{quality === "diamond" && <span className={styles.diamondBadge} title="四名玩家的两模型 Rating 全部超过 90"><Diamond size={12} />钻石局</span>}{quality === "gold" && <span className={styles.goldBadge} title="四名玩家各自的最高模型 Rating 均超过 90"><Medal size={12} />金分局</span>}</div></td>
                  <td>{matchDateFormatter.format(new Date(match.playedAt))}</td>
                  <td><StatusPill status={match.status} /></td>
                  <td><div className="seat-result">{[...match.seats].sort((left, right) => left.rank - right.rank).map((seat) => <span key={seat.seat}><b>{seat.rank}</b><i>{wind[seat.seat]}</i><em style={{ "--player-color": participantById[seat.participantId].color } as React.CSSProperties}>{participantById[seat.participantId].displayName}</em><small className={seat.competitionPoints >= 0 ? "positive" : "negative"}>{seat.competitionPoints >= 0 ? "+" : ""}{seat.competitionPoints.toFixed(1)}</small></span>)}</div></td>
                  <td><div className="source-links">{match.tenhouUrl ? <a href={match.tenhouUrl} target="_blank" rel="noreferrer">天凤<ExternalLink size={13} /></a> : !match.nagaUrl && match.sourceType === "majsoul" ? <span>雀魂 JSON</span> : !match.nagaUrl ? <span>—</span> : null}{match.nagaUrl && <a href={match.nagaUrl} target="_blank" rel="noreferrer">NAGA<ExternalLink size={13} /></a>}</div></td>
                  {admin && <td><Link className="table-edit-link" href={`/competitions/${competition.id}/matches/${match.matchNumber}`}><Pencil size={14} />修改对局</Link></td>}
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
