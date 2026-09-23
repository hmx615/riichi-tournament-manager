import Link from "next/link";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { notFound } from "next/navigation";
import { CompetitionSettingsForm } from "@/components/competition-settings-form";
import { DeleteCompetitionForm } from "@/components/delete-competition-form";
import { getCompetition } from "@/server/competition-repository";
import { requireAdminPage } from "@/server/auth";
import { listPeople } from "@/server/person-repository";
import { MatchPoolTagSettingsForm } from "@/components/match-pool-tag-settings-form";
import { DEFAULT_PERSON_TAG } from "@/domain/person-tags";
import { listPersonTags } from "@/server/person-tag-repository";

export default async function CompetitionSettingsPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  await requireAdminPage(`/competitions/${competitionId}/settings`);
  const [competition, people, availableTags] = await Promise.all([getCompetition(competitionId), listPeople(), listPersonTags()]);
  if (!competition) notFound();
  return (
    <div className="page form-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>比赛设置</h1></div></div>
      {competition.format === "individual" && <Link className="button schedule-settings-link" href={`/competitions/${competition.id}/schedule`}><CalendarClock size={17} />修改赛程</Link>}
      {competition.autoIncludePersonTags !== undefined && <MatchPoolTagSettingsForm
        competitionId={competition.id}
        availableTags={availableTags}
        selectedTags={competition.autoIncludePersonTags ?? [DEFAULT_PERSON_TAG]}
      />}
      <CompetitionSettingsForm competition={competition} people={people} />
      <DeleteCompetitionForm competitionId={competition.id} competitionCode={competition.code} matchCount={competition.matches.length} />
    </div>
  );
}
