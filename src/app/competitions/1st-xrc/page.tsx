import { notFound } from "next/navigation";
import { CompetitionOverview } from "@/components/competition-overview";
import { getCompetition } from "@/server/competition-repository";
import { computeCompetitionSummary } from "@/server/competition-statistics";
import { isAdmin } from "@/server/auth";

export default async function CompetitionPage() {
  const competition = await getCompetition("1st-xrc");
  if (!competition) notFound();
  const summary = await computeCompetitionSummary(competition);
  return <CompetitionOverview competition={competition} summary={summary} admin={await isAdmin()} />;
}
