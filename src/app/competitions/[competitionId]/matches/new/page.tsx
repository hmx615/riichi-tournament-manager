import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MatchEntryForm } from "@/components/match-entry-form";
import { getCompetition } from "@/server/competition-repository";
import { requireAdminPage } from "@/server/auth";

export default async function NewMatchPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  await requireAdminPage(`/competitions/${competitionId}/matches/new`);
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  return (
    <div className="page form-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回 {competition.name}</Link>
      <div className="page-heading"><div><p className="eyebrow">第 {competition.matches.length + 1} 场</p><h1>录入牌谱</h1></div></div>
      <MatchEntryForm competition={competition} />
    </div>
  );
}
