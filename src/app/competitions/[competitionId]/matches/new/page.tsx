import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MatchEntryForm } from "@/components/match-entry-form";
import { getCompetition } from "@/server/competition-repository";
import { requireAdminPage } from "@/server/auth";
import { scheduledMatch } from "@/domain/scheduled-match";

export default async function NewMatchPage({ params, searchParams }: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { competitionId } = await params;
  const query = await searchParams;
  const selection = new URLSearchParams();
  for (const key of ["scheduleId", "stage", "round", "table"]) if (typeof query[key] === "string") selection.set(key, query[key]);
  await requireAdminPage(`/competitions/${competitionId}/matches/new${selection.size ? `?${selection}` : ""}`);
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const labels = { preliminary: "初赛", semifinal: "半决赛", final: "决赛" };
  const schedule = competition.format === "individual" ? competition.individualSchedule?.find((table) =>
    query.scheduleId ? table.id === query.scheduleId : table.stage === query.stage && table.round === Number(query.round) && table.tableNumber === Number(query.table)
  ) : undefined;
  if (competition.format === "individual" && !schedule) return <div className="page form-page">
    <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
    <div className="page-heading"><h1>选择录入桌次</h1></div>
    <div className="individual-schedule-grid">{competition.individualSchedule?.filter((table) => table.status === "scheduled" && !scheduledMatch(competition, table)).map((table) =>
      <Link className="individual-schedule-card" key={table.id} href={`/competitions/${competition.id}/matches/new?scheduleId=${encodeURIComponent(table.id)}`}>
        <strong>{labels[table.stage]} · 第 {table.round} 轮 · A{table.tableNumber}</strong>
        <p>{table.participantIds.map((id) => competition.participants.find((p) => p.id === id)?.displayName).join("、")}</p>
      </Link>
    )}</div>
  </div>;
  return (
    <div className="page form-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回 {competition.name}</Link>
      <div className="page-heading"><div><p className="eyebrow">{schedule ? `${labels[schedule.stage]} · 第 ${schedule.round} 轮 · A${schedule.tableNumber}` : `第 ${Math.max(0, ...competition.matches.map((match) => match.matchNumber)) + 1} 场`}</p><h1>录入牌谱</h1></div></div>
      <MatchEntryForm competition={competition} schedule={schedule} />
    </div>
  );
}
