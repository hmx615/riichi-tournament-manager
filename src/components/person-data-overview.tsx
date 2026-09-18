import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PersonMetricGroups, type ComparePerson, type MetricSummary } from "@/components/person-metric-groups";
import { PersonSummary } from "@/components/person-summary";
import type { PersonLuckViews } from "@/server/luck-statistics";
import type { PersonStatistics } from "@/server/person-statistics";
import styles from "./person-data-overview.module.css";

const rankColors = ["#e3a51a", "#3b91b8", "#8b929a", "#cf5560"];

function pieGradient(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  let cursor = 0;
  return `conic-gradient(${counts.map((count, index) => {
    const start = cursor;
    cursor += count / total * 100;
    return `${rankColors[index]} ${start}% ${cursor}%`;
  }).join(", ")})`;
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

export function PersonDataOverview({ statistics, people, summaries, initialCompareId, luck }: {
  statistics: PersonStatistics;
  people: ComparePerson[];
  summaries: Record<string, MetricSummary>;
  initialCompareId: string | null;
  luck: PersonLuckViews | null;
}) {
  const { person, estimatedRank, estimatedRankPrecise, summary, rankCounts, ratings, quality, competitions, matches, totalCompetitionPoints } = statistics;
  const total = matches.length || 1;
  const averageRank = summary["平均顺位"];
  return (
    <>
      <PersonSummary
        totalPoints={totalCompetitionPoints}
        matchCount={matches.length}
        averageRank={averageRank ?? null}
        rank={estimatedRank}
        preciseRank={estimatedRankPrecise}
        luck={luck}
      >
        <section className="rank-distribution person-rank-section">
          <div className="rank-section-head"><h2>顺位分布</h2><div className="rank-legend">{rankColors.map((color, index) => <span key={color}><i style={{ background: color }} />{index + 1}位</span>)}</div></div>
          <div className="person-rank-body">
            <div className="rank-donut-wrap"><div className="rank-donut" style={{ background: pieGradient(rankCounts) }} /><div className="rank-donut-center"><strong>{averageRank?.toFixed(2) ?? "-"}</strong><small>平均顺位</small></div></div>
            <div className="person-rank-counts">{rankCounts.map((count, index) => <span key={index}><strong style={{ color: rankColors[index] }}>{count}</strong><small>{index + 1}位 · {(count / total * 100).toFixed(2)}%</small></span>)}</div>
          </div>
        </section>

        {ratings.length > 0 && <section className="data-group person-rating-section"><h2>NAGA Rating 与一致率</h2><div className="person-rating-grid">{ratings.map((rating) => <div key={rating.model} style={{ "--player-color": person.color } as React.CSSProperties}><strong>{rating.model}</strong><span>Rating:{rating.rating.toFixed(2)}</span><span>一致率:{(rating.agreementRate * 100).toFixed(2)}%</span><span>恶手率:{(rating.badMoveRate * 100).toFixed(2)}%</span></div>)}</div></section>}

        <section className={`data-group ${styles.qualitySection}`}><h2>对局质量</h2><div className={styles.qualityGrid}><span className={styles.diamondMetric}>钻率<strong>{quality.diamondRate == null ? "-" : `${(quality.diamondRate * 100).toFixed(2)}%`}</strong></span><span className={styles.goldMetric}>金率<strong>{quality.goldRate == null ? "-" : `${(quality.goldRate * 100).toFixed(2)}%`}</strong></span><span className={styles.horseMetric}>马率<strong>{quality.horseRate == null ? "-" : `${(quality.horseRate * 100).toFixed(2)}%`}</strong></span></div></section>
      </PersonSummary>

      <PersonMetricGroups
        person={{ id: person.id, displayName: person.displayName, color: person.color, matchCount: matches.length }}
        summary={summary}
        people={people}
        summaries={summaries}
        initialCompareId={initialCompareId}
      />

      <section className="section-block person-history-section"><div className="section-heading"><div><h2>分比赛成绩</h2></div></div><div className="table-wrap"><table className="person-table"><thead><tr><th>比赛</th><th>半庄</th><th>平均顺位</th><th>比赛积分</th></tr></thead><tbody>{competitions.map((competition) => <tr key={competition.competitionId}><td><Link href={`/competitions/${competition.competitionId}`}>{competition.competitionName}</Link><small>{competition.competitionCode}</small></td><td>{competition.matchCount}</td><td>{competition.averageRank.toFixed(2)}</td><td className={competition.competitionPoints >= 0 ? "positive" : "negative"}>{competition.competitionPoints >= 0 ? "+" : ""}{competition.competitionPoints.toFixed(1)}</td></tr>)}</tbody></table></div></section>

      <section className="section-block person-history-section"><div className="section-heading"><div><h2>对局历史</h2></div><span className="table-count">{matches.length} 场</span></div><div className="table-wrap"><table className={`person-table match-history-table ${styles.matchHistoryTable}`}><thead><tr><th>日期</th><th>比赛</th><th>场次</th><th>原始昵称</th><th>顺位</th><th>终局点数</th><th>比赛积分</th><th>ニシキ</th><th>カガシ</th><th>牌谱</th></tr></thead><tbody>{matches.map((match) => <tr key={`${match.competitionId}-${match.matchNumber}`}><td>{dateFormatter.format(new Date(match.playedAt))}</td><td><Link href={`/competitions/${match.competitionId}`}>{match.competitionName}</Link></td><td>#{match.matchNumber}</td><td>{match.sourceUsername}</td><td><strong>{match.rank}位</strong></td><td>{match.rawPoints.toLocaleString("zh-CN")}</td><td className={match.competitionPoints >= 0 ? "positive" : "negative"}>{match.competitionPoints >= 0 ? "+" : ""}{match.competitionPoints.toFixed(1)}</td><td className={styles.ratingCell}>{match.nagaRatings["ニシキ"]?.toFixed(2) ?? "-"}</td><td className={styles.ratingCell}>{match.nagaRatings["カガシ"]?.toFixed(2) ?? "-"}</td><td><div className="source-links">{match.tenhouUrl && <a href={match.tenhouUrl} target="_blank" rel="noreferrer">天凤<ExternalLink size={13} /></a>}{match.nagaUrl && <a href={match.nagaUrl} target="_blank" rel="noreferrer">NAGA<ExternalLink size={13} /></a>}{!match.tenhouUrl && !match.nagaUrl && <span>-</span>}</div></td></tr>)}</tbody></table></div></section>
    </>
  );
}
