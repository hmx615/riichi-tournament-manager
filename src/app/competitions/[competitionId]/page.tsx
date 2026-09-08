import { notFound } from "next/navigation";
import { CompetitionOverview } from "@/components/competition-overview";
import { getCompetition } from "@/server/competition-repository";
import { computeCompetitionSummary } from "@/server/competition-statistics";
import { isAdmin } from "@/server/auth";
import { loadPersonEstimatedRanks } from "@/server/person-statistics";
import { isIndividualCompetition } from "@/domain/competition-format";
import { IndividualCompetitionOverview } from "@/components/individual-competition-overview";

export default async function CompetitionPage({ params }: PageProps<"/competitions/[competitionId]">) {
  const { competitionId } = await params;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const [summary, personRanks, admin] = await Promise.all([
    competition.matches.length ? computeCompetitionSummary(competition) : {},
    loadPersonEstimatedRanks(),
    isAdmin(),
  ]);
  const participantRanks = Object.fromEntries(competition.participants.map((participant) => [participant.id, participant.personId ? personRanks[participant.personId] ?? null : null]));
  if (isIndividualCompetition(competition)) {
    return <IndividualCompetitionOverview competition={competition} summary={summary} showBackLink admin={admin} />;
  }
  return <CompetitionOverview competition={competition} summary={summary} participantRanks={participantRanks} showBackLink admin={admin} />;
}
