import Link from "next/link";
import { ArrowRight, CalendarDays, CirclePlus, Database, FilePlus2, Settings, Users } from "lucide-react";
import { competition as fallbackCompetition, totalsForCompetition } from "@/data/competition";
import { MatchLevelBadge } from "@/components/competition-overview";
import type { EstimatedRank } from "@/domain/estimated-rank";
import { assessMatchLevel } from "@/domain/match-level";
import { isIndividualCompetition, isMatchPoolCompetition } from "@/domain/competition-format";
import { listCompetitions, MATCH_POOL_ID } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import { listPeople } from "@/server/person-repository";
import { loadPersonEstimatedRanks } from "@/server/person-statistics";
import type { Competition } from "@/domain/types";
import { currentPlayer } from "@/server/player-auth";
import styles from "./page.module.css";

const competitionStatus = {
  draft: { label: "草稿", className: "status-scheduled" },
  active: { label: "进行中", className: "status-active" },
  completed: { label: "已完成", className: "status-completed" },
  archived: { label: "已归档", className: "status-scheduled" },
};

function completedMatches(competition: Competition) {
  return competition.matches.filter((match) => match.status === "completed").length;
}

function CompetitionScores({ competition }: { competition: Competition }) {
  const totals = totalsForCompetition(competition);
  // 按名次排列（一位在前），每张卡片一位选手，等宽等距。
  const ranked = [...competition.participants].sort((left, right) => totals[right.id] - totals[left.id]
    || left.displayName.localeCompare(right.displayName, "zh-Hans-CN"));
  return (
    <div className="score-cards">
      {ranked.map((participant, index) => (
        <article className="score-card" key={participant.id} style={{ "--player-color": participant.color } as React.CSSProperties}>
          <span className="score-card-rank">{index + 1}</span>
          <span className="score-card-name">{participant.displayName}</span>
          <strong className={totals[participant.id] >= 0 ? "positive" : "negative"}>{totals[participant.id] >= 0 ? "+" : ""}{totals[participant.id].toFixed(1)}</strong>
        </article>
      ))}
    </div>
  );
}

function CompetitionStrength({ competition, personRanks }: { competition: Competition; personRanks: Record<string, EstimatedRank | null> }) {
  if (isIndividualCompetition(competition)) return null;
  const assessment = assessMatchLevel(competition.participants.map((participant) => participant.personId ? personRanks[participant.personId] ?? null : null));
  return assessment ? <MatchLevelBadge assessment={assessment} compact /> : null;
}

export default async function CompetitionsPage() {
  const [admin, player, storedCompetitions, people, personRanks] = await Promise.all([
    isAdmin(),
    currentPlayer(),
    listCompetitions(),
    listPeople(),
    loadPersonEstimatedRanks(),
  ]);
  const matchPool = storedCompetitions.find((item) => item.id === MATCH_POOL_ID);
  const visibleCompetitions = storedCompetitions.filter((item) => item.id !== MATCH_POOL_ID);
  const allCompetitions = (visibleCompetitions.length
    ? visibleCompetitions
    : [fallbackCompetition]);
  const competitions = [...allCompetitions]
    .sort((a, b) => (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0) || completedMatches(b) - completedMatches(a));
  const competition = competitions[0];
  const completed = competition.matches.filter((match) => match.status === "completed").length;
  const otherCompetitions = competitions.filter((item) => item.id !== competition.id);
  const activeCompetitionCount = competitions.filter((item) => item.status === "active").length;
  // 已录入牌谱要算上家妈杯（人物池）：之前漏了它，数量对不上。
  const recordedMatchCount = (storedCompetitions.length ? storedCompetitions : allCompetitions)
    .reduce((sum, item) => sum + completedMatches(item), 0);
  const registeredPlayerCount = people.length;

  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">比赛管理</p><h1>比赛</h1></div>
        {admin && <Link className="button primary" href="/competitions/new"><CirclePlus size={17} />新建比赛</Link>}
      </div>

      <section className="summary-grid" aria-label="系统概况">
        <div className="summary-block"><CalendarDays /><span>进行中比赛<strong>{activeCompetitionCount}</strong></span></div>
        <div className="summary-block"><Database /><span>已录入牌谱<strong>{recordedMatchCount}</strong></span></div>
        <div className="summary-block"><Users /><span>登记选手<strong>{registeredPlayerCount}</strong></span></div>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><h2>当前比赛</h2></div></div>
        {matchPool && <article className="competition-row match-pool-row">
          <div className="competition-main">
            <div className={`competition-title ${styles.competitionTitle}`}><span className="match-pool-mark">♛ 天梯</span>{matchPool.name}<span className="status match-pool-status">长期开放</span></div>
            <div className="competition-meta">所有人物可参加 · {completedMatches(matchPool)} 半庄 / 无限</div>
            <div className="competition-footer">
              <div className="player-list"><span className="match-pool-all" title={matchPool.participants.map((participant) => participant.displayName).join("、")}><Users size={13} />全体玩家<span className="match-pool-all-count">{matchPool.participants.length} 人</span></span></div>
            </div>
          </div>
          <div className="competition-row-actions">
            {admin && <Link className="icon-link" href={`/competitions/${matchPool.id}/settings`} title="家妈杯设置" aria-label="家妈杯设置"><Settings size={17} /></Link>}
            {(admin || player) && <Link className="icon-link" href={`/competitions/${matchPool.id}/matches/new`} title="录入家妈杯牌谱" aria-label="录入家妈杯牌谱"><FilePlus2 size={17} /></Link>}
            <Link className="icon-link" href={`/competitions/${matchPool.id}`} title="打开国企天梯赛·家妈杯" aria-label="打开国企天梯赛·家妈杯"><ArrowRight /></Link>
          </div>
        </article>}
        <article className={`competition-row${isMatchPoolCompetition(competition) ? " pool-row" : ""}${competition.status === "completed" ? " completed-row" : ""}`}>
          <div className="competition-main">
            <div className={`competition-title ${styles.competitionTitle}`}>{competition.status === "active" && <span className="live-dot" />}{competition.name}<span className={`status ${competitionStatus[competition.status].className}`}>{competitionStatus[competition.status].label}</span><CompetitionStrength competition={competition} personRanks={personRanks} /></div>
            <div className="competition-meta">{competition.code} · {isMatchPoolCompetition(competition) ? `${completed} 半庄 / 无限` : `${completed}/${competition.plannedMatchCount}半庄`}</div>
            {isMatchPoolCompetition(competition)
              ? <div className="competition-footer"><div className="player-list"><span className="pool-player-count"><Users size={13} />{competition.participants.length} 人</span></div></div>
              : <CompetitionScores competition={competition} />}
          </div>
          <div className="competition-row-actions">
            {admin && competition.status !== "completed" && <Link className="icon-link" href={`/competitions/${competition.id}/settings`} title={`${competition.name}设置`} aria-label={`${competition.name}设置`}><Settings size={17} /></Link>}
            {(admin || player) && competition.status !== "completed" && <Link className="icon-link" href={`/competitions/${competition.id}/matches/new`} title={`录入${competition.name}牌谱`} aria-label={`录入${competition.name}牌谱`}><FilePlus2 size={17} /></Link>}
            <Link className="icon-link" href={`/competitions/${competition.id}`} title="打开比赛" aria-label="打开比赛"><ArrowRight /></Link>
          </div>
        </article>
        {otherCompetitions.map((item) => (
          <article className={`competition-row compact-row${isMatchPoolCompetition(item) ? " pool-row" : ""}${item.status === "completed" ? " completed-row" : ""}`} key={item.id}>
            <div className="competition-main">
              <div className={`competition-title ${styles.competitionTitle}`}>{item.status === "active" && <span className="live-dot" />}{item.name}<span className={`status ${competitionStatus[item.status].className}`}>{competitionStatus[item.status].label}</span><CompetitionStrength competition={item} personRanks={personRanks} /></div>
              <div className="competition-meta">{item.code} · {isMatchPoolCompetition(item) ? `${completedMatches(item)} 半庄 / 无限` : `${completedMatches(item)}/${item.plannedMatchCount}半庄`}</div>
              {isMatchPoolCompetition(item)
                ? <div className="competition-footer"><div className="player-list"><span className="pool-player-count"><Users size={13} />{item.participants.length} 人</span></div></div>
                : <CompetitionScores competition={item} />}
            </div>
            <div className="competition-row-actions">
              {admin && item.status !== "completed" && <Link className="icon-link" href={`/competitions/${item.id}/settings`} title={`${item.name}设置`} aria-label={`${item.name}设置`}><Settings size={17} /></Link>}
              {(admin || player) && item.status !== "completed" && <Link className="icon-link" href={`/competitions/${item.id}/matches/new`} title={`录入${item.name}牌谱`} aria-label={`录入${item.name}牌谱`}><FilePlus2 size={17} /></Link>}
              <Link className="icon-link" href={`/competitions/${item.id}`} title="打开比赛" aria-label={`打开${item.name}`}><ArrowRight /></Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
