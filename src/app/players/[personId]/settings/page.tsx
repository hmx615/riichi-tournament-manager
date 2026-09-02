import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PersonForm } from "@/components/person-form";
import { requireAdminPage } from "@/server/auth";
import { getPerson } from "@/server/person-repository";

export default async function PersonSettingsPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  await requireAdminPage(`/players/${personId}/settings`);
  const person = await getPerson(personId);
  if (!person) notFound();
  return <div className="page form-page"><Link className="back-link" href={`/players/${person.id}`}><ArrowLeft size={16} />返回人物数据</Link><div className="page-heading"><div><p className="eyebrow">人物库</p><h1>人物设置</h1></div></div><PersonForm person={person} /></div>;
}
