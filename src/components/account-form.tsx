"use client";

import { useActionState } from "react";
import { Camera, Save } from "lucide-react";
import { updateOwnAccountAction, type AccountState } from "@/app/account/actions";
import styles from "@/app/account/account.module.css";

const idle: AccountState = { status: "idle", message: "" };

export function AccountForm({
  username,
  displayName,
  personDisplayName,
  personId,
  avatarUrl,
  hasAvatar,
}: {
  username: string;
  displayName: string;
  personDisplayName: string;
  personId: string | null;
  avatarUrl: string | null;
  hasAvatar: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOwnAccountAction, idle);
  const values = state.values ?? {};
  return <section className="form-section">
    <div className="form-section-title"><span>1</span><div><h2>可以修改的资料</h2></div></div>
    {state.status === "error" && <p className="form-error" role="alert">{state.message}</p>}
    <form action={formAction} className={styles.form} encType="multipart/form-data">
      <label>登录账号
        <input name="username" defaultValue={values.username ?? username} key={`u-${username}`} required
          autoComplete="username" placeholder="登录时用这个，字母数字下划线，2-32 位" />
      </label>
      <label>我的昵称
        <input name="displayName" defaultValue={values.displayName ?? displayName} key={`d-${displayName}`}
          placeholder="只给自己看的备注名" />
      </label>
      <label>人物显示名
        <input name="personDisplayName" defaultValue={values.personDisplayName ?? personDisplayName} key={`p-${personDisplayName}`} required
          placeholder="排行榜和人物页上显示的名字" />
      </label>
      <div className={styles.avatarRow}>
        <span className={styles.avatarPreview}>
          {avatarUrl ? <img src={avatarUrl} alt="当前头像" /> : <Camera size={22} />}
        </span>
        <label className={styles.avatarPick}>
          换头像（JPG / PNG / WebP，2 MB 以内）
          <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" />
        </label>
        {hasAvatar && <label className={styles.removeAvatar}><input type="checkbox" name="removeAvatar" />删除当前头像</label>}
      </div>
      {personId && <p className="field-note">绑定人物：{personId}（不能在这里更换）</p>}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={pending}>
          <Save size={15} />{pending ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  </section>;
}
