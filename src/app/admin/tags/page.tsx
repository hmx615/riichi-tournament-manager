import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Tags } from "lucide-react";
import { CreatePersonTagForm, DeletePersonTagForm } from "@/components/person-tag-admin";
import { PersonTagMembersForm } from "@/components/person-tag-members";
import { requireAdminPage } from "@/server/auth";
import { listPeople } from "@/server/person-repository";
import { listPersonTags } from "@/server/person-tag-repository";
import { personTags } from "@/domain/person-tags";
import styles from "./tags.module.css";

export const metadata: Metadata = { title: "标签管理 | XRC" };

export default async function AdminTagsPage() {
  await requireAdminPage("/admin/tags");
  const [tags, people] = await Promise.all([listPersonTags(), listPeople()]);
  return <div className="page form-page">
    <Link className="back-link" href="/players"><ArrowLeft size={16} />返回排行榜</Link>
    <div className="page-heading"><div><p className="eyebrow">仅管理员可见</p><h1>人物标签管理</h1><p>这里创建的标签会成为人物资料页唯一可选的标签。</p></div></div>
    <CreatePersonTagForm />
    <section className="section-block">
      <div className="section-heading"><div><h2>已有标签</h2></div><span className="table-count">{tags.length} 个</span></div>
      {tags.length ? <div className={styles.tagList}>{tags.map((tag) => {
        const members = people.filter((person) => personTags(person).includes(tag));
        return <article className={styles.tagCard} key={tag}>
          <header className={styles.tagHead}>
            <strong><Tags size={15} /> {tag}</strong>
            <span className={styles.tagCount}>{members.length} / {people.length} 人</span>
            <DeletePersonTagForm tag={tag} />
          </header>
          <PersonTagMembersForm
            tag={tag}
            people={people.map((person) => ({
              id: person.id,
              displayName: person.displayName,
              color: person.color,
              tags: personTags(person),
            }))}
          />
        </article>;
      })}</div> : <div className="form-message">当前没有标签，请先创建标签后再编辑人物分类。</div>}
    </section>
  </div>;
}
