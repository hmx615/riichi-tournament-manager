import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { PersonStatistics } from "@/server/person-statistics";

type MetricType = "rate" | "decimal" | "point" | "signed";
type Metric = readonly [field: string, type: MetricType];

const rankColors = ["#e3a51a", "#3b91b8", "#8b929a", "#cf5560"];
const metricGroups: Array<{ title: string; metrics: Metric[] }> = [
  { title: "攻守与选择", metrics: [["和牌率", "rate"], ["放铳率", "rate"], ["副露率", "rate"], ["立直率", "rate"], ["自摸率", "rate"], ["默听率", "rate"], ["流听率", "rate"], ["平均起手向听", "decimal"]] },
  { title: "打点与效率", metrics: [["平均打点", "point"], ["平均铳点", "point"], ["打点效率", "point"], ["铳点损失", "point"], ["净打点效率", "signed"], ["和了巡数", "decimal"], ["平均被炸点数", "point"]] },
  { title: "立直与副露结果", metrics: [["立直后和牌率", "rate"], ["副露后和牌率", "rate"], ["立直后放铳率", "rate"], ["副露后放铳率", "rate"], ["立直后流局率", "rate"], ["副露后流局率", "rate"], ["先制率", "rate"], ["追立率", "rate"]] },
];

function pieGradient(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  let cursor = 0;
  return `conic-gradient(${counts.map((count, index) => {
    const start = cursor;
    cursor += count / total * 100;
    return `${rankColors[index]} ${start}% ${cursor}%`;
  }).join(", ")})`;
}

function displayValue(value: number | null | undefined, type: MetricType) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (type === "rate") return `${(value * 100).toFixed(2)}%`;
  if (type === "decimal") return value.toFixed(2);
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

export function PersonDataOverview({ statistics }: { statistics: PersonStatistics }) {
  const { person, summary, rankCounts, ratings, competitions, matches } = statistics;
  const total = matches.length || 1;
  const averageRank = summary["平均顺位"];
  return (
    <>
      <section className="summary-grid person-summary" aria-label="人物概况">
        <div className="summary-block"><span>半庄<strong>{matches.length}</strong></span></div>
        <div className="summary-block"><span>小局<strong>{summary["统计局数"] ?? 0}</strong></span></div>
        <div className="summary-block"><span>平均顺位<strong>{averageRank?.toFixed(2) ?? "-"}</strong></span></div>
      </section>

      <section className="rank-distribution person-rank-section">
        <div className="rank-section-head"><h2>顺位分布</h2><div className="rank-legend">{rankColors.map((color, index) => <span key={color}><i style={{ background: color }} />{index + 1}位</span>)}</div></div>
        <div className="person-rank-body">
          <div className="rank-donut-wrap"><div className="rank-donut" style={{ background: pieGradient(rankCounts) }} /><div className="rank-donut-center"><strong>{averageRank?.toFixed(2) ?? "-"}</strong><small>平均顺位</small></div></div>
          <div className="person-rank-counts">{rankCounts.map((count, index) => <span key={index}><strong style={{ color: rankColors[index] }}>{count}</strong><small>{index + 1}位 · {(count / total * 100).toFixed(2)}%</small></span>)}</div>
        </div>
      </section>

      {ratings.length > 0 && <section className="data-group person-rating-section"><h2>NAGA Rating 与一致率</h2><div className="person-rating-grid">{ratings.map((rating) => <div key={rating.model} style={{ "--player-color": person.color } as React.CSSProperties}><strong>{rating.model}</strong><span>Rating:{rating.rating.toFixed(2)}</span><span>一致率:{(rating.agreementRate * 100).toFixed(2)}%</span><span>恶手率:{(rating.badMoveRate * 100).toFixed(2)}%</span></div>)}</div></section>}

      <div className="person-metric-groups">{metricGroups.map((group) => <section className="data-group" key={group.title}><h2>{group.title}</h2><div className="person-metric-list">{group.metrics.map(([field, type]) => <div key={field}><span>{field}</span><strong>{displayValue(summary[field], type)}</strong></div>)}</div></section>)}</div>

      <section className="section-block person-history-section"><div className="section-heading"><div><h2>分比赛成绩</h2></div></div><div className="table-wrap"><table className="person-table"><thead><tr><th>比赛</th><th>半庄</th><th>平均顺位</th><th>比赛积分</th></tr></thead><tbody>{competitions.map((competition) => <tr key={competition.competitionId}><td><Link href={`/competitions/${competition.competitionId}`}>{competition.competitionName}</Link><small>{competition.competitionCode}</small></td><td>{competition.matchCount}</td><td>{competition.averageRank.toFixed(2)}</td><td className={competition.competitionPoints >= 0 ? "positive" : "negative"}>{competition.competitionPoints >= 0 ? "+" : ""}{competition.competitionPoints.toFixed(1)}</td></tr>)}</tbody></table></div></section>

      <section className="section-block person-history-section"><div className="section-heading"><div><h2>对局历史</h2></div><span className="table-count">{matches.length} 场</span></div><div className="table-wrap"><table className="person-table match-history-table"><thead><tr><th>日期</th><th>比赛</th><th>场次</th><th>原始昵称</th><th>顺位</th><th>终局点数</th><th>比赛积分</th><th>牌谱</th></tr></thead><tbody>{matches.map((match) => <tr key={`${match.competitionId}-${match.matchNumber}`}><td>{dateFormatter.format(new Date(match.playedAt))}</td><td><Link href={`/competitions/${match.competitionId}`}>{match.competitionName}</Link></td><td>#{match.matchNumber}</td><td>{match.sourceUsername}</td><td><strong>{match.rank}位</strong></td><td>{match.rawPoints.toLocaleString("zh-CN")}</td><td className={match.competitionPoints >= 0 ? "positive" : "negative"}>{match.competitionPoints >= 0 ? "+" : ""}{match.competitionPoints.toFixed(1)}</td><td><div className="source-links">{match.tenhouUrl && <a href={match.tenhouUrl} target="_blank" rel="noreferrer">天凤<ExternalLink size={13} /></a>}{match.nagaUrl && <a href={match.nagaUrl} target="_blank" rel="noreferrer">NAGA<ExternalLink size={13} /></a>}{!match.tenhouUrl && !match.nagaUrl && <span>-</span>}</div></td></tr>)}</tbody></table></div></section>
    </>
  );
}
