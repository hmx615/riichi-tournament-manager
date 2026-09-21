import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Inbox } from "lucide-react";
import { notFound } from "next/navigation";
import { EstimatedRankValue } from "@/components/estimated-rank-value";
import { PersonMetricGroups } from "@/components/person-metric-groups";
import { casualRecordHasNaga } from "@/domain/casual-record";
import { decodePersonId } from "@/domain/person-id";
import { orderedCasualRecords, loadCasualStatisticsForPerson } from "@/server/casual-statistics";
import { listCasualRecords } from "@/server/casual-repository";
import { listPeople } from "@/server/person-repository";
import styles from "./casual-person.module.css";

const rankColors = ["#e3a51a", "#3b91b8", "#8b929a", "#cf5560"];
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

function pieGradient(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  let cursor = 0;
  return `conic-gradient(${counts.map((count, index) => {
    const start = cursor;
    cursor += count / total * 100;
    return `${rankColors[index]} ${start}% ${cursor}%`;
  }).join(", ")})`;
}

export async function generateMetadata({ params }: { params: Promise<{ personId: string }> }): Promise<Metadata> {
  const { personId } = await params;
  return { title: `${decodePersonId(personId)} 散排数据 | XRC` };
}

export default async function PersonCasualPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const id = decodePersonId(personId);
  const [casual, records, people] = await Promise.all([
    loadCasualStatisticsForPerson(id),
    listCasualRecords(),
    listPeople(),
  ]);
  const person = casual.statistics?.person ?? people.find((item) => item.id === id);
  if (!person) notFound();
  const peopleById = new Map(people.map((item) => [item.id, item]));
  const recordByMatchNumber = new Map(orderedCasualRecords(records).map((record, index) => [index + 1, record]));
  const matches = casual.statistics?.matches ?? [];
  const summary = casual.statistics?.summary ?? {};
  const rankCounts = casual.statistics?.rankCounts ?? [0, 0, 0, 0];
  const total = matches.length || 1;
  const averageRank = summary["平均顺位"];
  const summaries = casual.summaries;
  const nagaMatches = matches.filter((match) => Object.keys(match.nagaRatings).length > 0).length;

  return <div className="page person-page">
    <div className={styles.backRow}>
      <Link className="back-link" href={`/players/${encodeURIComponent(person.id)}`}><ArrowLeft size={16} />返回 {person.displayName}</Link>
      <Link className="back-link" href="/players"><ArrowLeft size={16} />返回排行榜</Link>
    </div>
    <div className="page-heading">
      <div>
        <p className="eyebrow">自选牌谱 · 独立统计</p>
        <h1>{person.displayName} 的散排数据</h1>
        <p className={styles.subtitle}>这些牌谱由本人或管理员手动录入，不与正式比赛混算。</p>
      </div>
    </div>
    {matches.length ? <>
      <section className="summary-grid">
        <div className="summary-block"><span>散排半庄<strong>{matches.length}</strong></span></div>
        <div className="summary-block"><span>平均顺位<strong>{averageRank == null ? "-" : averageRank.toFixed(2)}</strong></span></div>
        <div className="summary-block"><span>推定段位<EstimatedRankValue rank={casual.statistics?.estimatedRank ?? null} precise={casual.statistics?.estimatedRankPrecise ?? null} /></span></div>
      </section>
      <section className="rank-distribution person-rank-section">
        <div className="rank-section-head"><h2>顺位分布</h2><div className="rank-legend">{rankColors.map((color, index) => <span key={color}><i style={{ background: color }} />{index + 1}位</span>)}</div></div>
        <div className="person-rank-body">
          <div className="rank-donut-wrap"><div className="rank-donut" style={{ background: pieGradient(rankCounts) }} /><div className="rank-donut-center"><strong>{averageRank == null ? "-" : averageRank.toFixed(2)}</strong><small>平均顺位</small></div></div>
          <div className="person-rank-counts">{rankCounts.map((count, index) => <span key={index}><strong style={{ color: rankColors[index] }}>{count}</strong><small>{index + 1}位 · {(count / total * 100).toFixed(2)}%</small></span>)}</div>
        </div>
      </section>
      <PersonMetricGroups
        person={{ id: person.id, displayName: person.displayName, color: person.color, matchCount: matches.length }}
        summary={summary}
        people={casual.people}
        summaries={summaries}
        initialCompareId={null}
      />
      <section className="section-block">
        <div className="section-heading"><div><h2>散排对局</h2></div><span className="table-count">{matches.length} 场 · 其中 {nagaMatches} 场有 NAGA</span></div>
        <div className="table-wrap">
          <table className="person-table">
            <thead><tr><th>日期</th><th>对手</th><th>顺位</th><th>终局点数</th><th>牌谱</th><th>录入人</th></tr></thead>
            <tbody>{[...matches].sort((left, right) => right.matchNumber - left.matchNumber).map((match) => {
              const record = recordByMatchNumber.get(match.matchNumber);
              const others = (record?.seats ?? []).filter((seat) => seat.personId !== person.id);
              return <tr key={match.matchNumber}>
                <td>{dateFormatter.format(new Date(match.playedAt))}<small>#{match.matchNumber}</small></td>
                <td><div className={styles.opponents}>{others.map((seat) => {
                  const opponent = seat.personId ? peopleById.get(seat.personId) : null;
                  return <span key={seat.seat}>{opponent ? <Link href={`/players/${encodeURIComponent(opponent.id)}`}>{opponent.displayName}</Link> : <em>{seat.guestName || "排位对手"}</em>}<small>{seat.rank}位</small></span>;
                })}</div></td>
                <td><strong>{match.rank}位</strong></td>
                <td>{match.rawPoints.toLocaleString("zh-CN")}</td>
                <td><div className="source-links">
                  {record?.tenhouUrl && <a href={record.tenhouUrl} target="_blank" rel="noreferrer">天凤<ExternalLink size={13} /></a>}
                  {record?.nagaUrl && <a href={record.nagaUrl} target="_blank" rel="noreferrer">NAGA<ExternalLink size={13} /></a>}
                  {record && casualRecordHasNaga(record) && <span className={styles.nagaBadge}>含 NAGA</span>}
                  {!record?.tenhouUrl && !record?.nagaUrl && <span>-</span>}
                </div></td>
                <td>{record?.createdByUsername || "管理员"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </> : <div className={styles.empty}><Inbox size={30} /><strong>还没有散排牌谱</strong><span>玩家在「散排」页录入包含 {person.displayName} 的牌谱后，这里会单独统计展示。</span></div>}
  </div>;
}
