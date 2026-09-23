"use client";

import { useActionState } from "react";
import { Save, Tags } from "lucide-react";
import { saveMatchPoolTagsAction, type MatchPoolTagsState } from "@/app/competitions/[competitionId]/settings/actions";

const initialState: MatchPoolTagsState = { status: "idle", message: "" };

export function MatchPoolTagSettingsForm({ competitionId, availableTags, selectedTags }: {
  competitionId: string;
  availableTags: string[];
  selectedTags: string[];
}) {
  const [state, action, pending] = useActionState(saveMatchPoolTagsAction, initialState);
  return (
    <form className="form-layout" action={action}>
      <input name="competitionId" type="hidden" value={competitionId} />
      <section className="form-section">
        <div className="form-section-title"><span><Tags size={14} /></span><div><h2>匹配池自动加入标签</h2></div></div>
        <div className="choice-group">
          {availableTags.map((tag) => <label key={tag}>
            <input name="autoIncludePersonTags" type="checkbox" value={tag} defaultChecked={selectedTags.includes(tag)} />
            <span>{tag}</span>
          </label>)}
          {!availableTags.length && <p className="field-note">尚未创建可用标签，请先到标签管理中创建。</p>}
        </div>
        {state.message && <p className={`form-message${state.status === "success" ? " success" : ""}`} role="status">{state.message}</p>}
        <div className="form-actions"><button className="button primary" type="submit" disabled={pending}><Save size={17} />{pending ? "正在保存" : "保存自动加入规则"}</button></div>
      </section>
    </form>
  );
}
