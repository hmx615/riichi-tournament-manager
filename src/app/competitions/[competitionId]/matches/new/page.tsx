import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MatchEntryForm } from "@/components/match-entry-form";
import { getCompetition } from "@/server/competition-repository";
import { canEnterCompetitionMatches, requireCompetitionMatchEntryPage } from "@/server/match-entry-auth";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";
import { scheduledMatch, tableHasParticipant } from "@/domain/scheduled-match";
import { individualWeekOf } from "@/domain/individual-standings";

export default async function NewMatchPage({ params, searchParams }: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { competitionId } = await params;
  const query = await searchParams;
  const selection = new URLSearchParams();
  for (const key of ["scheduleId", "stage", "round", "table"]) if (typeof query[key] === "string") selection.set(key, query[key]);
  await requireCompetitionMatchEntryPage(competitionId, `/competitions/${competitionId}/matches/new${selection.size ? `?${selection}` : ""}`);
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  // 选手只能给自己那桌录入，所以桌次列表也只留自己那几桌。
  const player = await isAdmin() ? null : await currentPlayer();
  const myTablesOnly = player !== null;
  const labels = { preliminary: "初赛", final: "决赛" };
  const schedule = competition.format === "individual" ? competition.individualSchedule?.find((table) =>
    query.scheduleId ? table.id === query.scheduleId : table.stage === query.stage && table.round === Number(query.round) && table.tableNumber === Number(query.table)
  ) : undefined;
  // 直接改 URL 指向别人那桌时不给表单（服务端 action 也会再挡一次）。
  if (player && schedule && !tableHasParticipant(competition, schedule, player.personId ?? "")) return <div className="page form-page">
    <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
    <div className="page-heading"><h1>只能录入自己所在桌次的牌谱</h1></div>
    <p className="field-note">这一桌没有你。请回到赛程页选择你所在的桌次。</p>
  </div>;
  if (competition.format === "individual" && !schedule) return <div className="page form-page">
    <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
    <div className="page-heading"><h1>选择录入桌次</h1></div>
    {/* 选手只看到自己所在的桌次，管理员看全部待录桌次。 */}
    {myTablesOnly && <p className="field-note">这里只显示你所在桌次待录入的牌谱{player?.personId ? "" : "；账号尚未绑定人物，请联系管理员"}。</p>}
    <div className="individual-schedule-grid">{competition.individualSchedule?.filter((table) => table.status === "scheduled" && !scheduledMatch(competition, table) && (!player || tableHasParticipant(competition, table, player.personId ?? ""))).map((table) =>
      <Link className="individual-schedule-card" key={table.id} href={`/competitions/${competition.id}/matches/new?scheduleId=${encodeURIComponent(table.id)}`}>
        <strong>{labels[table.stage]} · 第 {individualWeekOf(table)} 周 · 第 {table.round} 轮 · A{table.tableNumber}</strong>
        <p>{table.participantIds.map((id) => competition.participants.find((p) => p.id === id)?.displayName).join("、")}</p>
      </Link>
    )}</div>
  </div>;
  return (
    <div className="page form-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回 {competition.name}</Link>
      <div className="page-heading"><div><p className="eyebrow">{schedule ? `${labels[schedule.stage]} · 第 ${individualWeekOf(schedule)} 周 · 第 ${schedule.round} 轮 · A${schedule.tableNumber}` : `第 ${Math.max(0, ...competition.matches.map((match) => match.matchNumber)) + 1} 场`}</p><h1>录入牌谱</h1></div></div>
      <MatchEntryForm competition={competition} schedule={schedule} />
    </div>
  );
  }
