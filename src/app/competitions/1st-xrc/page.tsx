import { notFound } from "next/navigation";
import { CompetitionOverview } from "@/components/competition-overview";
import { getCompetition } from "@/server/competition-repository";
import { computeCompetitionSummary } from "@/server/competition-statistics";
import { isAdmin } from "@/server/auth";
import { loadPersonEstimatedRanks } from "@/server/person-statistics";

export default async function CompetitionPage() {
  const competition = await getCompetition("1st-xrc");
  if (!competition) notFound();
  const [summary, personRanks, admin] = await Promise.all([computeCompetitionSummary(competition), loadPersonEstimatedRanks(), isAdmin()]);
  const participantRanks = Object.fromEntries(competition.participants.map((participant) => [participant.id, participant.personId ? personRanks[participant.personId] ?? null : null]));
  return <CompetitionOverview competition={competition} summary={summary} participantRanks={participantRanks} admin={admin} />;
}
