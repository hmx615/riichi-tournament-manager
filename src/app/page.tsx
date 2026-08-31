import Link from "next/link";
import { ArrowRight, CalendarDays, CirclePlus, Database, Users } from "lucide-react";
import { competition as fallbackCompetition, totalsForCompetition } from "@/data/competition";
import { PlayerTag } from "@/components/player-tag";
import { listCompetitions } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import type { Competition } from "@/domain/types";

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

export default async function CompetitionsPage() {
  const admin = await isAdmin();
  const storedCompetitions = await listCompetitions();
  const competition = storedCompetitions.find((item) => item.id === "1st-xrc") ?? fallbackCompetition;
  const completed = competition.matches.filter((match) => match.status === "completed").length;
  const otherCompetitions = storedCompetitions.filter((item) => item.id !== competition.id);
  const competitions = [competition, ...otherCompetitions];
  const activeCompetitionCount = competitions.filter((item) => item.status === "active").length;
  const recordedMatchCount = competitions.reduce((sum, item) => sum + completedMatches(item), 0);
  const registeredPlayerCount = new Set(competitions.flatMap((item) => item.participants.map((participant) => participant.displayName.replace(/\s+/g, "")))).size;

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
        <article className="competition-row">
          <div className="competition-main">
            <div className="competition-title">{competition.status === "active" && <span className="live-dot" />}{competition.name}<span className={`status ${competitionStatus[competition.status].className}`}>{competitionStatus[competition.status].label}</span></div>
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
              <div className="competition-title">{item.status === "active" && <span className="live-dot" />}{item.name}<span className={`status ${competitionStatus[item.status].className}`}>{competitionStatus[item.status].label}</span></div>
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
