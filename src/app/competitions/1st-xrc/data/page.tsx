import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MetricComparison } from "@/components/competition-data/metric-comparison";
import { NagaRatingComparison } from "@/components/competition-data/naga-rating-comparison";
import { RankDistribution } from "@/components/competition-data/rank-distribution";
import { getCompetition } from "@/server/competition-repository";
import { computeCompetitionSummary } from "@/server/competition-statistics";
import { RatingLineChart } from "@/components/rating-line-chart";

export default async function CompetitionDataPage() {
  const competition = await getCompetition("1st-xrc");
  if (!competition) notFound();
  const summary = await computeCompetitionSummary(competition);
  const chartSeries = competition.participants.map((participant) => ({ id: participant.id, label: participant.displayName, color: participant.color, values: competition.matches.map((match) => match.nagaRatings?.find((rating) => rating.participantId === participant.id && rating.model === "ニシキ")?.rating ?? null) }));
  return (
    <div className="page data-page">
      <Link className="back-link" href="/competitions/1st-xrc"><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>数据对比</h1></div></div>
      <RankDistribution competition={competition} summary={summary} />
      <NagaRatingComparison competition={competition} />
      <RatingLineChart series={chartSeries} />
      <MetricComparison competition={competition} summary={summary} />
    </div>
  );
}
