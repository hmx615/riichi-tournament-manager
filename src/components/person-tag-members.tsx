"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { CheckCheck, Eraser, Save, Search } from "lucide-react";
import { savePersonTagMembersAction, type PersonTagActionState } from "@/app/admin/tags/actions";
import styles from "./person-tag-members.module.css";

const initialState: PersonTagActionState = { status: "idle", message: "" };

export type TagMemberCandidate = { id: string; displayName: string; color: string; tags: string[] };

/** 批量维护一个标签下的人：勾选=有这个标签，取消=移除。 */
export function PersonTagMembersForm({ tag, people }: { tag: string; people: TagMemberCandidate[] }) {
  const [state, action, pending] = useActionState(savePersonTagMembersAction, initialState);
  const [selected, setSelected] = useState<string[]>(() => people.filter((person) => person.tags.includes(tag)).map((person) => person.id));
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return people;
    return people.filter((person) => person.displayName.toLowerCase().includes(keyword) || person.id.toLowerCase().includes(keyword));
  }, [people, query]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function selectAllVisible() {
    setSelected((current) => [...new Set([...current, ...filtered.map((person) => person.id)])]);
  }

  function clearVisible() {
    const visible = new Set(filtered.map((person) => person.id));
    setSelected((current) => current.filter((id) => !visible.has(id)));
  }

  function invertVisible() {
    const visible = filtered.map((person) => person.id);
    setSelected((current) => {
      const next = new Set(current);
      for (const id of visible) {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return [...next];
    });
  }

  return (
    <form className={styles.form} action={action}>
      <input name="tag" type="hidden" value={tag} />
      {selected.map((id) => <input key={id} name="personIds" type="hidden" value={id} />)}
      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索人物名或 ID" /></label>
        <button className="button" type="button" onClick={selectAllVisible} disabled={!filtered.length}><CheckCheck size={14} />勾选筛选结果</button>
        <button className="button" type="button" onClick={invertVisible} disabled={!filtered.length}>反选</button>
        <button className="button" type="button" onClick={clearVisible} disabled={!filtered.length}><Eraser size={14} />清空筛选结果</button>
        <span className={styles.count}>已选 <strong>{selected.length}</strong> / {people.length} 人</span>
      </div>
      <div className={styles.grid}>
        {filtered.map((person) => <label key={person.id} className={`${styles.member}${selectedSet.has(person.id) ? ` ${styles.memberActive}` : ""}`} style={{ "--player-color": person.color } as React.CSSProperties}>
          <input type="checkbox" checked={selectedSet.has(person.id)} onChange={() => toggle(person.id)} />
          <span className={styles.dot} />
          <span className={styles.name}>{person.displayName}</span>
        </label>)}
        {!filtered.length && <p className={styles.empty}>没有匹配的人物</p>}
      </div>
      <div className={styles.actions}>
        <button className="button primary" type="submit" disabled={pending}><Save size={15} />{pending ? "正在保存" : "保存成员"}</button>
        {state.message && <span className={state.status === "success" ? styles.success : styles.error} role="status">{state.message}</span>}
      </div>
    </form>
  );
}
