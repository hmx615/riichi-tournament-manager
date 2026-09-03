import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { CompetitionSettingsForm } from "@/components/competition-settings-form";
import { DeleteCompetitionForm } from "@/components/delete-competition-form";
import { getCompetition } from "@/server/competition-repository";
import { requireAdminPage } from "@/server/auth";
import { listPeople } from "@/server/person-repository";

export default async function CompetitionSettingsPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  await requireAdminPage(`/competitions/${competitionId}/settings`);
  const [competition, people] = await Promise.all([getCompetition(competitionId), listPeople()]);
  if (!competition) notFound();
  return (
    <div className="page form-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>比赛设置</h1></div></div>
      <CompetitionSettingsForm competition={competition} people={people} />
      <DeleteCompetitionForm competitionId={competition.id} competitionCode={competition.code} matchCount={competition.matches.length} />
    </div>
  );
}
