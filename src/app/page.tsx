import Link from "next/link";
import { ArrowRight, CalendarDays, CirclePlus, Database, FilePlus2, Settings, Users } from "lucide-react";
import { competition as fallbackCompetition, totalsForCompetition } from "@/data/competition";
import { MatchLevelBadge } from "@/components/competition-overview";
import { PlayerTag } from "@/components/player-tag";
import type { EstimatedRank } from "@/domain/estimated-rank";
import { assessMatchLevel } from "@/domain/match-level";
import { isIndividualCompetition } from "@/domain/competition-format";
import { listCompetitions, MATCH_POOL_ID } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import { listPeople } from "@/server/person-repository";
import { loadPersonEstimatedRanks } from "@/server/person-statistics";
import type { Competition } from "@/domain/types";
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
  return (
    <div className="score-preview">
      {competition.participants.map((participant) => (
        <span key={participant.id}>
          <small>{participant.displayName}</small>
          <strong className={totals[participant.id] >= 0 ? "positive" : "negative"}>{totals[participant.id] >= 0 ? "+" : ""}{totals[participant.id].toFixed(1)}</strong>
        </span>
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
  const [admin, storedCompetitions, people, personRanks] = await Promise.all([
    isAdmin(),
    listCompetitions(),
    listPeople(),
    loadPersonEstimatedRanks(),
  ]);
  const matchPool = storedCompetitions.find((item) => item.id === MATCH_POOL_ID);
  // The home page only exposes the active public competitions: the match pool,
  // the two retained cups, and every multi-stage individual competition.
  const visibleCompetitions = storedCompetitions.filter((item) => item.id !== MATCH_POOL_ID && (item.id === "1st-rc" || item.id === "1st-xrc" || isIndividualCompetition(item)));
  const allCompetitions = (visibleCompetitions.length
    ? visibleCompetitions
    : [fallbackCompetition]);
  const competitions = [...allCompetitions]
    .sort((a, b) => (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0) || completedMatches(b) - completedMatches(a));
  const competition = competitions[0];
  const completed = competition.matches.filter((match) => match.status === "completed").length;
  const otherCompetitions = competitions.filter((item) => item.id !== competition.id);
  const activeCompetitionCount = competitions.filter((item) => item.status === "active").length;
  const recordedMatchCount = competitions.reduce((sum, item) => sum + completedMatches(item), 0);
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
            <div className="player-list"><span className="match-pool-all" title={matchPool.participants.map((participant) => participant.displayName).join("、")}><Users size={13} />全体玩家<span className="match-pool-all-count">{matchPool.participants.length} 人</span></span></div>
          </div>
          <div className="competition-row-actions">
            {admin && <><Link className="icon-link" href={`/competitions/${matchPool.id}/settings`} title="家妈杯设置" aria-label="家妈杯设置"><Settings size={17} /></Link><Link className="icon-link" href={`/competitions/${matchPool.id}/matches/new`} title="录入家妈杯牌谱" aria-label="录入家妈杯牌谱"><FilePlus2 size={17} /></Link></>}
            <Link className="icon-link" href={`/competitions/${matchPool.id}`} title="打开国企天梯赛·家妈杯" aria-label="打开国企天梯赛·家妈杯"><ArrowRight /></Link>
          </div>
        </article>}
        <article className="competition-row">
          <div className="competition-main">
            <div className={`competition-title ${styles.competitionTitle}`}>{competition.status === "active" && <span className="live-dot" />}{competition.name}<span className={`status ${competitionStatus[competition.status].className}`}>{competitionStatus[competition.status].label}</span><CompetitionStrength competition={competition} personRanks={personRanks} /></div>
            <div className="competition-meta">{competition.code} · {completed}/{competition.plannedMatchCount}半庄</div>
            <div className="player-list">
              {competition.participants.map((participant) => <PlayerTag participant={participant} compact key={participant.id} />)}
            </div>
          </div>
          <CompetitionScores competition={competition} />
          <Link className="icon-link" href={`/competitions/${competition.id}`} title="打开比赛" aria-label="打开比赛"><ArrowRight /></Link>
        </article>
        {otherCompetitions.map((item) => (
          <article className="competition-row compact-row" key={item.id}>
            <div className="competition-main">
              <div className={`competition-title ${styles.competitionTitle}`}>{item.status === "active" && <span className="live-dot" />}{item.name}<span className={`status ${competitionStatus[item.status].className}`}>{competitionStatus[item.status].label}</span><CompetitionStrength competition={item} personRanks={personRanks} /></div>
              <div className="competition-meta">{item.code} · {completedMatches(item)}/{item.plannedMatchCount}半庄</div>
              <div className="player-list">{item.participants.map((participant) => <PlayerTag participant={participant} compact key={participant.id} />)}</div>
            </div>
            <CompetitionScores competition={item} />
            <Link className="icon-link" href={`/competitions/${item.id}`} title="打开比赛" aria-label={`打开${item.name}`}><ArrowRight /></Link>
          </article>
        ))}
      </section>
    </div>
  );
}
