"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Save } from "lucide-react";
import type { Competition, Person } from "@/domain/types";
import { saveCompetitionSettingsAction, type CompetitionSettingsState } from "@/app/competitions/[competitionId]/settings/actions";

const initialState: CompetitionSettingsState = { status: "idle", message: "" };

export function CompetitionSettingsForm({ competition, people }: { competition: Competition; people: Person[] }) {
  const [state, action, pending] = useActionState(saveCompetitionSettingsAction, initialState);
  const scoringLocked = competition.matches.length > 0;
  return (
    <form className="form-layout" action={action}>
      <input name="competitionId" type="hidden" value={competition.id} />
      <section className="form-section">
        <div className="form-section-title"><span>1</span><div><h2>比赛设置</h2></div></div>
        <div className="field-grid">
          <label className="field wide"><span>比赛名称</span><input name="name" defaultValue={competition.name} required /></label>
          <label className="field"><span>比赛代号</span><input value={competition.code} disabled /></label>
          <label className="field"><span>比赛状态</span><select name="status" defaultValue={competition.status}><option value="draft">草稿</option><option value="active">进行中</option><option value="completed">已完成</option><option value="archived">已归档</option></select></label>
          <label className="field"><span>比赛半庄数</span><input name="plannedMatchCount" type="number" min="1" defaultValue={competition.plannedMatchCount} required /></label>
          <label className="field"><span>原点</span><input name="initialPoints" type="number" step="100" defaultValue={competition.initialPoints} readOnly={scoringLocked} required /></label>
          <label className="field wide"><span>顺位马点</span><input name="rankPoints" defaultValue={competition.rankPoints.join(", ")} readOnly={scoringLocked} required /></label>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-title"><span>2</span><div><h2>参赛选手</h2></div></div>
        <div className="participant-editor">
          {competition.participants.map((participant, index) => (
            <div className="participant-form with-person" key={participant.id}>
              <b>{index + 1}</b>
              <select name={`participantPersonId${index}`} aria-label={`选手${index + 1}人物身份`} defaultValue={participant.personId || ""} required><option value="" disabled>选择人物</option>{people.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select>
              <input name={`participantName${index}`} aria-label={`选手${index + 1}显示名称`} defaultValue={participant.displayName} required />
              <input name={`participantUsernames${index}`} aria-label={`选手${index + 1}牌谱用户名`} placeholder="牌谱用户名，多个用逗号分隔" defaultValue={participant.usernames.join(", ")} required />
              <input name={`participantColor${index}`} aria-label={`选手${index + 1}颜色`} className="color-input" type="color" defaultValue={participant.color} />
            </div>
          ))}
        </div>
      </section>
      {state.message && <p className="form-message" role="alert">{state.message}</p>}
      <div className="form-actions"><Link className="button" href={`/competitions/${competition.id}`}>取消</Link><button className="button primary" type="submit" disabled={pending}><Save size={17} />{pending ? "正在保存" : "保存设置"}</button></div>
    </form>
  );
}
