import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { notFound } from "next/navigation";
import { PersonDataOverview } from "@/components/person-data-overview";
import { PersonAvatar } from "@/components/person-avatar";
import { isAdmin } from "@/server/auth";
import { loadAllPersonStatistics } from "@/server/person-statistics";
import { loadPersonLuck } from "@/server/luck-statistics";
import { decodePersonId } from "@/domain/person-id";
import { pickCompareMetrics } from "@/domain/metric-compare";
import { PersonTags } from "@/components/person-tags";

export default async function PersonPage({ params, searchParams }: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ personId }, query] = await Promise.all([params, searchParams]);
  const [admin, allStatistics, luckReports] = await Promise.all([isAdmin(), loadAllPersonStatistics(), loadPersonLuck()]);
  const statistics = allStatistics[decodePersonId(personId)];
  if (!statistics) notFound();
  const { person } = statistics;
  const luck = luckReports[person.id] ?? null;
  // 对比数据全部来自同一份统计快照，客户端切换对手时不需要再请求服务器。
  const entries = Object.values(allStatistics);
  const compareId = typeof query.compare === "string" ? decodePersonId(query.compare) : "";
  const initialCompareId = compareId && compareId !== person.id && allStatistics[compareId] ? compareId : null;
  const people = entries
    .map((item) => ({
      id: item.person.id,
      displayName: item.person.displayName,
      color: item.person.color,
      matchCount: item.matches.length,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN"));
  const summaries = Object.fromEntries(entries.map((item) => [item.person.id, pickCompareMetrics(item.summary)]));
  return <div className="page person-page">
    <Link className="back-link" href="/players"><ArrowLeft size={16} />返回排行榜</Link>
    <div className="person-profile-header"><div className="page-heading"><div><p className="eyebrow">{person.kind === "human" ? "人类选手" : "AI 选手"}</p><h1>{person.displayName}</h1><PersonTags person={person} /><p>{person.aliases.join(" · ")}</p></div>{admin && <div className="heading-actions"><Link className="button" href={`/players/${encodeURIComponent(person.id)}/settings`}><Settings size={17} />人物设置</Link></div>}</div><PersonAvatar person={person} size="large" /></div>
    <PersonDataOverview statistics={statistics} people={people} summaries={summaries} initialCompareId={initialCompareId} luck={luck} />
  </div>;
}
