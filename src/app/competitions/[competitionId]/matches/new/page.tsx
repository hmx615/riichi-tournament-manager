import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MatchEntryForm } from "@/components/match-entry-form";
import { getCompetition } from "@/server/competition-repository";
import { requireCompetitionMatchEntryPage } from "@/server/match-entry-auth";
import { enterableTablesForViewer } from "@/server/match-entry-auth";
import { scheduledMatch } from "@/domain/scheduled-match";
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
  // 选手只看到自己所在的那几桌；管理员看到全部待录桌次。
  const enterable = await enterableTablesForViewer(competition);
  const labels = { preliminary: "初赛", final: "决赛" };
  const schedule = competition.format === "individual" ? competition.individualSchedule?.find((table) =>
    query.scheduleId ? table.id === query.scheduleId : table.stage === query.stage && table.round === Number(query.round) && table.tableNumber === Number(query.table)
  ) : undefined;
  // 直接改 URL 指到别人那桌时连表单都不给（保存 action 也会再挡一次）。
  if (schedule && enterable && !enterable.has(schedule.id)) return <div className="page form-page">
    <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
    <div className="page-heading"><h1>只能录入自己所在桌次的牌谱</h1></div>
    <p className="field-note">这一桌没有你。请回到赛程页选择你所在的桌次。</p>
  </div>;
  if (competition.format === "individual" && !schedule) return <div className="page form-page">
    <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
    <div className="page-heading"><h1>选择录入桌次</h1></div>
    {enterable && <p className="field-note">这里只显示你所在桌次还没录入的牌谱，共 {enterable.size} 桌。</p>}
    <div className="individual-schedule-grid">{competition.individualSchedule?.filter((table) => table.status === "scheduled" && !scheduledMatch(competition, table) && (!enterable || enterable.has(table.id))).map((table) =>
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
