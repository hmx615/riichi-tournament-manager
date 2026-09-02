import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { notFound } from "next/navigation";
import { PersonDataOverview } from "@/components/person-data-overview";
import { isAdmin } from "@/server/auth";
import { loadAllPersonStatistics } from "@/server/person-statistics";

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const [admin, allStatistics] = await Promise.all([isAdmin(), loadAllPersonStatistics()]);
  const statistics = allStatistics[personId];
  if (!statistics) notFound();
  const { person } = statistics;
  return <div className="page person-page">
    <Link className="back-link" href="/players"><ArrowLeft size={16} />返回人物目录</Link>
    <div className="page-heading"><div><p className="eyebrow">{person.kind === "human" ? "人类选手" : "AI 选手"}</p><h1>{person.displayName}</h1><p>{person.aliases.join(" · ")}</p></div>{admin && <div className="heading-actions"><Link className="button" href={`/players/${person.id}/settings`}><Settings size={17} />人物设置</Link></div>}</div>
    <PersonDataOverview statistics={statistics} />
  </div>;
}
