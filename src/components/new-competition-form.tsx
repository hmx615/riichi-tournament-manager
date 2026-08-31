"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check } from "lucide-react";
import { createCompetitionAction, type CreateCompetitionState } from "@/app/competitions/actions";

const initialState: CreateCompetitionState = { message: "" };
const colors = ["#d1495b", "#168f83", "#6657c7", "#d58a18"];

export function NewCompetitionForm() {
  const [state, action, pending] = useActionState(createCompetitionAction, initialState);
  return (
    <form className="form-layout" action={action}>
      <section className="form-section">
        <div className="form-section-title"><span>1</span><div><h2>比赛设置</h2></div></div>
        <div className="field-grid">
          <label className="field wide"><span>比赛名称</span><input name="name" placeholder="例如：2nd XRC 人机大战" required /></label>
          <label className="field"><span>比赛代号</span><input name="code" placeholder="2ND-XRC" pattern="[A-Za-z0-9-]+" required /></label>
          <label className="field"><span>比赛半庄数</span><input name="plannedMatchCount" type="number" min="1" defaultValue="50" required /></label>
          <label className="field"><span>原点</span><input name="initialPoints" type="number" step="100" defaultValue="25000" required /></label>
          <label className="field"><span>顺位马点</span><input name="rankPoints" defaultValue="+30, +10, -10, -30" required /></label>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-title"><span>2</span><div><h2>参赛选手</h2></div></div>
        <div className="participant-editor">
          {[0, 1, 2, 3].map((index) => <div className="participant-form" key={index}><b>{index + 1}</b><input name={`participantName${index}`} aria-label={`选手${index + 1}显示名称`} placeholder="显示名称" required /><input name={`participantUsername${index}`} aria-label={`选手${index + 1}天凤用户名`} placeholder="天凤用户名" required /><select name={`participantKind${index}`} aria-label={`选手${index + 1}类型`} defaultValue={index > 1 ? "ai" : "human"}><option value="human">人类</option><option value="ai">AI</option></select><input name={`participantColor${index}`} aria-label={`选手${index + 1}颜色`} className="color-input" type="color" defaultValue={colors[index]} /></div>)}
        </div>
      </section>
      {state.message && <p className="form-message" role="alert">{state.message}</p>}
      <div className="form-actions"><Link className="button" href="/">取消</Link><button className="button primary" type="submit" disabled={pending}><Check size={17} />{pending ? "正在创建" : "创建并进入赛程"}</button></div>
    </form>
  );
}
