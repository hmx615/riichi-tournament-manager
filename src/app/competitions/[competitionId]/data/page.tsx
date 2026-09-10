import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MetricComparison } from "@/components/competition-data/metric-comparison";
import { NagaRatingComparison } from "@/components/competition-data/naga-rating-comparison";
import { RankDistribution } from "@/components/competition-data/rank-distribution";
import { getCompetition } from "@/server/competition-repository";
import { computeCompetitionSummary } from "@/server/competition-statistics";
import { isIndividualCompetition } from "@/domain/competition-format";
import { IndividualCompetitionData } from "@/components/individual-competition-overview";
import { RatingLineChart } from "@/components/rating-line-chart";

export default async function CompetitionDataPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  if (competition.matches.length === 0) return (
    <div className="page data-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>数据对比</h1></div></div>
      <section className="section-block empty-schedule"><h2>尚未录入对局</h2></section>
    </div>
  );
  const summary = await computeCompetitionSummary(competition);
  const models = ["ニシキ", "カガシ"];
  const chartSeries = competition.participants.map((participant, index) => ({ id: participant.id, label: participant.displayName, color: participant.color, values: competition.matches.map((match) => match.nagaRatings?.find((rating) => rating.participantId === participant.id && rating.model === models[0])?.rating ?? null) }))
  if (isIndividualCompetition(competition)) return (
    <div className="page data-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code} · 个人赛</p><h1>积分与数据</h1></div></div>
      <IndividualCompetitionData competition={competition} summary={summary} />
    </div>
  );
  return (
    <div className="page data-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>数据对比</h1></div></div>
      <RankDistribution competition={competition} summary={summary} />
      <NagaRatingComparison competition={competition} />
      <RatingLineChart title="当前比赛四人 Rating 走势" series={chartSeries} />
      <MetricComparison competition={competition} summary={summary} />
    </div>
  );
}
