"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { createPersonTagAction, deletePersonTagAction, type PersonTagActionState } from "@/app/admin/tags/actions";

const initialState: PersonTagActionState = { status: "idle", message: "" };

export function CreatePersonTagForm() {
  const [state, action, pending] = useActionState(createPersonTagAction, initialState);
  return <form className="form-layout" action={action}>
    <section className="form-section">
      <div className="form-section-title"><span><Plus size={14} /></span><div><h2>创建人物标签</h2><p>创建后即可在人物设置和人物池规则中选择。</p></div></div>
      <div className="field-grid">
        <label className="field wide"><span>标签名称</span><input name="name" required maxLength={30} placeholder="例如：校队成员" /></label>
      </div>
      {state.message && <p className={`form-message${state.status === "success" ? " success" : ""}`} role="status">{state.message}</p>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={pending}><Plus size={16} />{pending ? "正在创建" : "创建标签"}</button></div>
    </section>
  </form>;
}

function DeleteButton({ tag }: { tag: string }) {
  const { pending } = useFormStatus();
  return <button className="button danger-button" type="submit" disabled={pending} aria-label={`删除标签 ${tag}`}><Trash2 size={14} />{pending ? "删除中" : "删除"}</button>;
}

export function DeletePersonTagForm({ tag }: { tag: string }) {
  return <form action={deletePersonTagAction} onSubmit={(event) => {
    if (!window.confirm(`确定删除标签“${tag}”吗？该标签会同时从所有人物和人物池自动加入规则中移除。`)) event.preventDefault();
  }}>
    <input name="name" type="hidden" value={tag} />
    <DeleteButton tag={tag} />
  </form>;
}
