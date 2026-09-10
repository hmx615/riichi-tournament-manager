"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deletePersonAction, type DeletePersonState } from "@/app/players/actions";
import styles from "./delete-person-form.module.css";

const initialState: DeletePersonState = { status: "idle", message: "" };

export function DeletePersonForm({ personId, competitions }: {
  personId: string;
  competitions: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(deletePersonAction.bind(null, personId), initialState);
  const [confirmation, setConfirmation] = useState("");
  return <section className={`form-section ${styles.section}`}>
    <div className="form-section-title"><span>4</span><div><h2>删除人物</h2><p>删除人物档案、平台账号和头像，此操作不可撤销。</p></div></div>
    {competitions.length > 0 ? <div>
      <p className="form-message" role="status">该人物已报名以下比赛，暂不能删除。</p>
      <ul>{competitions.map((competition) => <li key={competition.id}><Link href={`/competitions/${competition.id}/settings`}>{competition.name}</Link></li>)}</ul>
    </div> : <form className="field-grid" action={action}>
      <label className="field wide"><span>输入人物 ID {personId} 确认删除</span><input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required /></label>
      {state.message && <p className="form-message field wide" role="alert">{state.message}</p>}
      <div className="form-actions field wide"><button className="button danger" type="submit" disabled={pending || confirmation !== personId}><Trash2 size={16} />{pending ? "正在删除" : "删除人物"}</button></div>
    </form>}
  </section>;
}
