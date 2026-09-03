"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCompetitionAction, type DeleteCompetitionState } from "@/app/competitions/[competitionId]/settings/actions";

const initialState: DeleteCompetitionState = { status: "idle", message: "" };

export function DeleteCompetitionForm({ competitionId, competitionCode, matchCount }: {
  competitionId: string;
  competitionCode: string;
  matchCount: number;
}) {
  const boundAction = deleteCompetitionAction.bind(null, competitionId);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const [confirmation, setConfirmation] = useState("");
  return (
    <section className="form-section">
      <div className="form-section-title"><span>3</span><div><h2>删除比赛</h2><p>将删除整场比赛及其 {matchCount} 场对局记录，人物档案和牌谱缓存保留。</p></div></div>
      <form className="field-grid" action={action}>
        <label className="field wide"><span>输入比赛代号 {competitionCode} 确认删除</span><input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
        {state.message && <p className="form-message field wide" role="alert">{state.message}</p>}
        <div className="form-actions field wide"><button className="button danger" type="submit" disabled={pending || confirmation !== competitionCode} onClick={(event) => {
          if (!window.confirm(`确定删除比赛“${competitionCode}”及其全部对局记录？`)) event.preventDefault();
        }}><Trash2 size={16} />{pending ? "正在删除" : "删除整场比赛"}</button></div>
      </form>
    </section>
  );
}
