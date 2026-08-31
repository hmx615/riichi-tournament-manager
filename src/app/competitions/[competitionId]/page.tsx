import { notFound } from "next/navigation";
import { CompetitionOverview } from "@/components/competition-overview";
import { getCompetition } from "@/server/competition-repository";
import { computeCompetitionSummary } from "@/server/competition-statistics";
import { isAdmin } from "@/server/auth";

export default async function CompetitionPage({ params }: PageProps<"/competitions/[competitionId]">) {
  const { competitionId } = await params;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const summary = competition.matches.length ? await computeCompetitionSummary(competition) : {};
  return <CompetitionOverview competition={competition} summary={summary} showBackLink admin={await isAdmin()} />;
}
