"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Save } from "lucide-react";
import type { Person } from "@/domain/types";
import { savePersonAction, type PersonFormState } from "@/app/players/actions";

const initialState: PersonFormState = { status: "idle", message: "" };

function accountText(person: Person | undefined, platform: "tenhou" | "majsoul" | "other") {
  return person?.accounts.filter((account) => account.platform === platform).map((account) => account.username).join(", ") || "";
}

export function PersonForm({ person }: { person?: Person }) {
  const [state, action, pending] = useActionState(savePersonAction, initialState);
  return <form className="form-layout" action={action}>
    <input name="mode" type="hidden" value={person ? "edit" : "create"} />
    {person && <input name="originalId" type="hidden" value={person.id} />}
    <section className="form-section"><div className="form-section-title"><span>1</span><div><h2>人物身份</h2></div></div><div className="field-grid">
      <label className="field"><span>人物 ID</span><input name="id" defaultValue={person?.id || ""} placeholder="例如：hmx" pattern="[a-z0-9-]+" readOnly={Boolean(person)} required /></label>
      <label className="field"><span>显示名称</span><input name="displayName" defaultValue={person?.displayName || ""} required /></label>
      <label className="field"><span>人物类型</span><select name="kind" defaultValue={person?.kind || "human"}><option value="human">人类</option><option value="ai">AI</option></select></label>
      <label className="field"><span>识别颜色</span><input className="color-input" name="color" type="color" defaultValue={person?.color || "#168f83"} /></label>
      <label className="field wide"><span>历史昵称</span><textarea name="aliases" rows={3} defaultValue={person?.aliases.join(", ") || ""} /></label>
    </div></section>
    <section className="form-section"><div className="form-section-title"><span>2</span><div><h2>平台账号</h2></div></div><div className="field-grid">
      <label className="field wide"><span>天凤账号</span><input name="tenhouAccounts" defaultValue={accountText(person, "tenhou")} /></label>
      <label className="field wide"><span>雀魂账号</span><input name="majsoulAccounts" defaultValue={accountText(person, "majsoul")} /></label>
      <label className="field wide"><span>其他账号</span><input name="otherAccounts" defaultValue={accountText(person, "other")} /></label>
    </div></section>
    {state.message && <p className="form-message" role="alert">{state.message}</p>}
    <div className="form-actions"><Link className="button" href={person ? `/players/${person.id}` : "/players"}>取消</Link><button className="button primary" type="submit" disabled={pending}><Save size={17} />{pending ? "正在保存" : "保存人物"}</button></div>
  </form>;
}
