import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewCompetitionForm } from "@/components/new-competition-form";
import { requireAdminPage } from "@/server/auth";
import { listPeople } from "@/server/person-repository";
import { listPersonTags } from "@/server/person-tag-repository";

export default async function NewCompetitionPage() {
  await requireAdminPage("/competitions/new");
  const [people, availableTags] = await Promise.all([listPeople(), listPersonTags()]);
  // 默认开赛日取下一个周日，主办也可以在建比赛时改成任意周日。
  const today = new Date();
  const nextSunday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + ((7 - today.getUTCDay()) % 7)));
  return (
    <div className="page form-page">
      <Link className="back-link" href="/"><ArrowLeft size={16} />返回比赛列表</Link>
      <div className="page-heading"><div><p className="eyebrow">新赛程</p><h1>创建比赛</h1></div></div>
      <NewCompetitionForm people={people} availableTags={availableTags} defaultStartDate={nextSunday.toISOString().slice(0, 10)} />
    </div>
  );
}
