import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PersonForm } from "@/components/person-form";
import { requireAdminPage } from "@/server/auth";
import { listPersonTags } from "@/server/person-tag-repository";
import { listPeople } from "@/server/person-repository";
import { getClubRegistration } from "@/server/club-registration-repository";
import { normalizePersonTags } from "@/domain/person-tags";
import { personDraftFromRecord } from "@/domain/person-draft";

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const registrationId = typeof query.registration === "string" ? query.registration : "";
  await requireAdminPage(`/players/new${registrationId ? `?registration=${encodeURIComponent(registrationId)}` : ""}`);
  const [availableTags, people] = await Promise.all([listPersonTags(), listPeople()]);
  const registration = registrationId ? await getClubRegistration(registrationId) : null;
  // 从信息收集记录自动填人物草稿：字段识别与收集表格式解耦，换表也能用。
  const draft = registration ? personDraftFromRecord(
    registration as unknown as Record<string, unknown>,
    { people, defaultTags: normalizePersonTags(typeof query.tag === "string" ? [query.tag] : []) },
  ) : null;
  return <div className="page form-page">
    <Link className="back-link" href={registration ? "/join/responses" : "/players"}><ArrowLeft size={16} />{registration ? "返回信息收集记录" : "返回人物目录"}</Link>
    <div className="page-heading"><div><p className="eyebrow">{draft ? "来自信息收集" : "人物库"}</p><h1>{draft ? "按收集记录创建人物" : "新建人物"}</h1></div>{draft && <span className="draft-badge"><Sparkles size={14} />已自动填写 {draft.sources.length} 个字段</span>}</div>
    <PersonForm availableTags={availableTags} {...(draft ? { draft } : {})} />
  </div>;
}
