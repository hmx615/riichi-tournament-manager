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

export default async function CompetitionDataPage({ params, searchParams }: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { competitionId } = await params;
  const query = await searchParams;
  const round = typeof query.round === "string" && /^\d+$/.test(query.round) ? Number(query.round) : 0;
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
  if (competition.id === "match-pool") return (
    <div className="page data-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回家妈杯</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>顺位分布</h1></div></div>
      <RankDistribution competition={competition} summary={summary} />
    </div>
  );
  if (isIndividualCompetition(competition)) return (
    <div className="page data-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code} · 个人赛</p><h1>积分与数据</h1></div></div>
      <IndividualCompetitionData competition={competition} summary={summary} round={round} />
    </div>
  );
  return (
    <div className="page data-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
      <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>数据对比</h1></div></div>
      <RankDistribution competition={competition} summary={summary} />
      <NagaRatingComparison competition={competition} />
      <MetricComparison competition={competition} summary={summary} />
    </div>
  );
}
