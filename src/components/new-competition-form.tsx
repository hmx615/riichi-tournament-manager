"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import type { Person } from "@/domain/types";
import { createCompetitionAction, type CreateCompetitionState } from "@/app/competitions/actions";

const initialState: CreateCompetitionState = { message: "" };
const colors = ["#d1495b", "#168f83", "#6657c7", "#d58a18", "#4e8fc5", "#9c5f9c", "#4d9b73", "#b56a3b"];

export function NewCompetitionForm({ people }: { people: Person[] }) {
  const [state, action, pending] = useActionState(createCompetitionAction, initialState);
  const [format, setFormat] = useState<"four_player" | "individual">("four_player");
  const [participantCount, setParticipantCount] = useState(4);
  const individual = format === "individual";
  return (
    <form className="form-layout" action={action}>
      <section className="form-section">
        <div className="form-section-title"><span>1</span><div><h2>比赛设置</h2></div></div>
        <div className="field-grid">
          <label className="field wide"><span>比赛名称</span><input name="name" placeholder="例如：2nd XRC 人机大战" required /></label>
          <label className="field"><span>比赛代号</span><input name="code" placeholder="2ND-XRC" pattern="[A-Za-z0-9-]+" required /></label>
          <label className="field"><span>赛事类型</span><select name="format" value={format} onChange={(event) => { const next = event.target.value as "four_player" | "individual"; setFormat(next); setParticipantCount(next === "individual" ? 8 : 4); }}><option value="four_player">四人对局赛</option><option value="individual">个人赛</option></select></label>
          <label className="field"><span>{individual ? "报名人数" : "参赛人数"}</span><input name="participantCount" type="number" min="4" max="200" value={participantCount} readOnly={!individual} onChange={(event) => setParticipantCount(Math.max(4, Math.min(200, Number(event.target.value) || 4)))} required /></label>
          <label className="field"><span>{individual ? "总计划半庄数（显示用）" : "比赛半庄数"}</span><input name="plannedMatchCount" type="number" min="1" defaultValue="50" required /></label>
          <label className="field"><span>原点</span><input name="initialPoints" type="number" step="100" defaultValue="25000" required /></label>
          <label className="field"><span>顺位马点</span><input name="rankPoints" defaultValue="+30, +10, -10, -30" required /></label>
          {individual && <>
            <label className="field"><span>初赛每人半庄数</span><input name="preliminaryMatches" type="number" min="0" defaultValue="4" required /></label>
            <label className="field"><span>半决赛每人半庄数</span><input name="semifinalMatches" type="number" min="0" defaultValue="0" required /></label>
            <label className="field"><span>决赛每人半庄数</span><input name="finalMatches" type="number" min="0" defaultValue="3" required /></label>
          </>}
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-title"><span>2</span><div><h2>参赛选手</h2></div><Link className="button form-section-action" href="/players/new"><UserPlus size={15} />新建人物</Link></div>
        <div className="participant-editor">
          {Array.from({ length: participantCount }, (_, index) => <div className="participant-form with-person" key={index}><b>{index + 1}</b><select name={`participantPersonId${index}`} aria-label={`选手${index + 1}人物身份`} defaultValue="" required><option value="" disabled>选择人物</option>{people.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select><input name={`participantName${index}`} aria-label={`选手${index + 1}显示名称`} placeholder="比赛显示名称" required /><input name={`participantUsername${index}`} aria-label={`选手${index + 1}牌谱用户名`} placeholder="牌谱用户名" required /><input name={`participantColor${index}`} aria-label={`选手${index + 1}颜色`} className="color-input" type="color" defaultValue={colors[index % colors.length]} /></div>)}
        </div>
      </section>
      {state.message && <p className="form-message" role="alert">{state.message}</p>}
      <div className="form-actions"><Link className="button" href="/">取消</Link><button className="button primary" type="submit" disabled={pending}><Check size={17} />{pending ? "正在创建" : "创建并进入赛程"}</button></div>
    </form>
  );
}
