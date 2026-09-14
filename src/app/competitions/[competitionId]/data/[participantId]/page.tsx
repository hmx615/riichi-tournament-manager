import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getCompetition } from "@/server/competition-repository";
import { computeCompetitionSummary } from "@/server/competition-statistics";
import { PlayerTag } from "@/components/player-tag";

export default async function IndividualParticipantDataPage({ params }: { params: Promise<{ competitionId: string; participantId: string }> }) {
  const { competitionId, participantId } = await params;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const participant = competition.participants.find((item) => item.id === participantId);
  if (!participant) notFound();
  const summary = await computeCompetitionSummary(competition);
  const data = summary[participant.id] ?? {};
  const values = Object.entries(data).filter(([, value]) => value !== null && value !== undefined);
  return <div className="page data-page"><Link className="back-link" href={`/competitions/${competition.id}/data`}><ArrowLeft size={16} />返回数据总览</Link><div className="page-heading"><div><p className="eyebrow">{competition.code} · 详细数据</p><h1><PlayerTag participant={participant} /></h1></div></div><div className="table-wrap"><table className="match-table"><thead><tr><th>数据维度</th><th>数值</th></tr></thead><tbody>{values.map(([key, value]) => <tr key={key}><td>{key}</td><td>{typeof value === "number" ? Number.isInteger(value) ? value : value.toFixed(3) : String(value)}</td></tr>)}</tbody></table></div></div>;
}
