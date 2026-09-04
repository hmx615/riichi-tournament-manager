import Link from "next/link";
import { ArrowRight, CirclePlus } from "lucide-react";
import { formatEstimatedRank } from "@/domain/estimated-rank";
import { isAdmin } from "@/server/auth";
import { loadAllPersonStatistics } from "@/server/person-statistics";
import { PersonAvatar } from "@/components/person-avatar";
import styles from "./players.module.css";

export default async function PlayersPage() {
  const [admin, statistics] = await Promise.all([isAdmin(), loadAllPersonStatistics()]);
  const people = Object.values(statistics).sort((left, right) => Number(right.summary["对局数"] || 0) - Number(left.summary["对局数"] || 0) || left.person.displayName.localeCompare(right.person.displayName));
  const matchCount = new Set(people.flatMap((item) => item.matches.map((match) => `${match.competitionId}-${match.matchNumber}`))).size;
  return <div className="page players-page">
    <div className="page-heading"><div><p className="eyebrow">人物数据</p><h1>人物</h1></div>{admin && <Link className="button primary" href="/players/new"><CirclePlus size={17} />新建人物</Link>}</div>
    <section className="summary-grid"><div className="summary-block"><span>登记人物<strong>{people.length}</strong></span></div><div className="summary-block"><span>人类选手<strong>{people.filter((item) => item.person.kind === "human").length}</strong></span></div><div className="summary-block"><span>跨比赛牌谱<strong>{matchCount}</strong></span></div></section>
    <section className="section-block person-directory"><div className="section-heading"><div><h2>人物目录</h2></div></div><div className="person-directory-list">{people.map(({ person, estimatedRank, summary, competitions }) => <article key={person.id} style={{ "--player-color": person.color } as React.CSSProperties}><div className="person-directory-name"><PersonAvatar person={person} size="small" /><div><strong>{person.displayName}</strong><small>{person.kind === "human" ? "人类" : "AI"} · {person.aliases.slice(0, 3).join(" / ")}</small></div></div><div className={styles.directoryMetrics}><span>半庄<strong>{summary["对局数"] ?? 0}</strong></span><span>平均顺位<strong>{summary["平均顺位"]?.toFixed(2) ?? "-"}</strong></span><span>参赛<strong>{competitions.length}</strong></span><span>推定段位<strong>{formatEstimatedRank(estimatedRank)}</strong></span></div><Link className="icon-link" href={`/players/${person.id}`} title="人物数据" aria-label={`查看${person.displayName}数据`}><ArrowRight /></Link></article>)}</div></section>
  </div>;
}
