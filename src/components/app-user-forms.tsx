"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import {
  createAppUserAction,
  deleteAppUserAction,
  resetAppUserPasswordAction,
  type AppUserActionState,
} from "@/app/admin/users/actions";
import styles from "./app-user-forms.module.css";

const initialState: AppUserActionState = { status: "idle", message: "" };

function Credentials({ credentials }: { credentials: AppUserActionState["credentials"] }) {
  if (!credentials) return null;
  return <p className={styles.credentials}>
    <strong>{credentials.username}</strong>
    <code>{credentials.password}</code>
    <small>密码只在这里显示一次，请立即抄送给本人。</small>
  </p>;
}

export function CreateAppUserForm({ people }: { people: Array<{ id: string; displayName: string }> }) {
  const [state, action, pending] = useActionState(createAppUserAction, initialState);
  return (
    <form className="form-layout" action={action}>
      <section className="form-section">
        <div className="form-section-title"><span><UserPlus size={14} /></span><div><h2>新建选手账号</h2></div></div>
        <div className="field-grid">
          <label className="field"><span>账号</span><input name="username" required defaultValue={state.values?.username || ""} placeholder="例如 phq" pattern="[A-Za-z0-9_]+" /></label>
          <label className="field"><span>绑定人物</span><select name="personId" required defaultValue={state.values?.personId || ""}>
            <option value="" disabled>选择人物</option>
            {people.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}
          </select></label>
          <label className="field"><span>备注（可选）</span><input name="displayName" defaultValue={state.values?.displayName || ""} /></label>
          <label className="field"><span>初始密码（留空自动生成）</span><input name="password" minLength={8} placeholder="至少 8 位" /></label>
        </div>
        {state.message && <p className={`form-message${state.status === "success" ? " success" : ""}`} role="status">{state.message}</p>}
        <Credentials credentials={state.credentials} />
        <div className="form-actions"><button className="button primary" type="submit" disabled={pending}><UserPlus size={16} />{pending ? "正在创建" : "创建账号"}</button></div>
      </section>
    </form>
  );
}

export function ResetAppUserPasswordForm({ userId, username }: { userId: string; username: string }) {
  const [state, action, pending] = useActionState(resetAppUserPasswordAction, initialState);
  return (
    <form action={action} className={styles.inlineForm}>
      <input name="userId" type="hidden" value={userId} />
      <button className="button" type="submit" disabled={pending} title={`重置 ${username} 的密码`}><KeyRound size={14} />{pending ? "重置中" : "重置密码"}</button>
      <Credentials credentials={state.credentials} />
      {state.status === "error" && <span className="form-message error">{state.message}</span>}
    </form>
  );
}

function DeleteButton({ username }: { username: string }) {
  const { pending } = useFormStatus();
  return <button className="button danger-button" type="submit" disabled={pending} title={`删除账号 ${username}`} aria-label={`删除账号 ${username}`}><Trash2 size={14} />{pending ? "删除中" : "删除"}</button>;
}

export function DeleteAppUserForm({ userId, username }: { userId: string; username: string }) {
  return (
    <form action={deleteAppUserAction} onSubmit={(event) => {
      if (!window.confirm(`确定删除账号「${username}」吗？该账号将立即无法登录，已有散排记录会保留。`)) event.preventDefault();
    }}>
      <input name="userId" type="hidden" value={userId} />
      <DeleteButton username={username} />
    </form>
  );
}
