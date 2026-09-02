import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PersonForm } from "@/components/person-form";
import { requireAdminPage } from "@/server/auth";

export default async function NewPersonPage() {
  await requireAdminPage("/players/new");
  return <div className="page form-page"><Link className="back-link" href="/players"><ArrowLeft size={16} />返回人物目录</Link><div className="page-heading"><div><p className="eyebrow">人物库</p><h1>新建人物</h1></div></div><PersonForm /></div>;
}
