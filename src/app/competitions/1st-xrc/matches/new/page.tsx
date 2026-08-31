import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { MatchEntryForm } from "@/components/match-entry-form";
import { getCompetition } from "@/server/competition-repository";
import { requireAdminPage } from "@/server/auth";

export default async function NewMatchPage() {
  await requireAdminPage("/competitions/1st-xrc/matches/new");
  const competition = await getCompetition("1st-xrc");
  if (!competition) notFound();
  return (
    <div className="page form-page">
      <Link className="back-link" href="/competitions/1st-xrc"><ArrowLeft size={16} />返回 {competition.name}</Link>
      <div className="page-heading"><div><p className="eyebrow">第 {competition.matches.length + 1} 场</p><h1>录入牌谱</h1></div></div>
      <MatchEntryForm competition={competition} />
    </div>
  );
}
