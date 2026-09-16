import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MatchCorrectionForm } from "@/components/match-correction-form";
import { getCompetition } from "@/server/competition-repository";
import { requireAdminPage } from "@/server/auth";

export default async function EditMatchPage({ params, searchParams }: {
  params: Promise<{ competitionId: string; matchNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { competitionId, matchNumber } = await params;
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : "";
  const saved = query.saved === "1";
  await requireAdminPage(`/competitions/${competitionId}/matches/${matchNumber}`);
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const match = competition.matches.find((item) => item.matchNumber === Number(matchNumber));
  if (!match) notFound();
  return (
    <div className="page form-page">
      <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回赛程</Link>
      <div className="page-heading"><div><p className="eyebrow">修改对局</p><h1>第 {match.matchNumber} 场</h1><p>{match.tenhouLogId}</p></div></div>
      {saved && <p className="form-message success" role="status">身份修正已保存，积分榜与统计已按新身份重算。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <MatchCorrectionForm competition={competition} match={match} backHref={`/competitions/${competition.id}`} backLabel="取消" />
    </div>
  );
}
