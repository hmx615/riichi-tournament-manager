import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewCompetitionForm } from "@/components/new-competition-form";
import { requireAdminPage } from "@/server/auth";

export default async function NewCompetitionPage() {
  await requireAdminPage("/competitions/new");
  return (
    <div className="page form-page">
      <Link className="back-link" href="/"><ArrowLeft size={16} />返回比赛列表</Link>
      <div className="page-heading"><div><p className="eyebrow">新赛程</p><h1>创建比赛</h1></div></div>
      <NewCompetitionForm />
    </div>
  );
}
