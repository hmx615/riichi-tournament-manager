"use client";

import Link from "next/link";
import { Check, CheckCircle2, IdCard, MessageCircleMore, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useActionState } from "react";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/join/actions";
import { mahjongRanks } from "@/domain/club-registration";
import styles from "@/app/join/join.module.css";

const initialState: RegistrationFormState = { status: "idle", message: "" };

export function ClubRegistrationForm() {
  const [state, action, pending] = useActionState(submitRegistrationAction, initialState);
  const value = (name: string) => state.values?.[name] || "";

  if (state.status === "success") {
    return (
      <section className={styles.success} aria-live="polite">
        <span className={styles.successIcon}><CheckCircle2 size={30} /></span>
        <p className={styles.kicker}>提交成功</p>
        <h1>我们已收到你的信息</h1>
        <p>后续赛事组织或训练资源对接会通过 QQ 联系，请勿重复提交。</p>
        <Link className="button primary" href="/">返回比赛首页</Link>
      </section>
    );
  }

  return (
    <form className={styles.form} action={action}>
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="website">个人网站</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <section className={styles.section} aria-labelledby="identity-heading">
        <div className={styles.sectionHeading}>
          <span><UserRound size={18} /></span>
          <div><p>01</p><h2 id="identity-heading">基本信息</h2></div>
        </div>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>学号 <b>*</b></span>
            <div className={styles.inputWithIcon}><IdCard size={17} /><input name="studentId" defaultValue={value("studentId")} inputMode="text" autoComplete="off" maxLength={32} placeholder="请填写本人学号" required /></div>
          </label>
          <label className={styles.field}>
            <span>网名 <b>*</b></span>
            <input name="nickname" defaultValue={value("nickname")} maxLength={30} placeholder="群内或比赛中使用的称呼" required />
          </label>
          <label className={styles.field}>
            <span>QQ <b>*</b></span>
            <div className={styles.inputWithIcon}><MessageCircleMore size={17} /><input name="qq" defaultValue={value("qq")} inputMode="numeric" autoComplete="off" minLength={5} maxLength={12} pattern="[0-9]{5,12}" placeholder="用于后续联系" required /></div>
          </label>
          <label className={styles.field}>
            <span>当前段位 <b>*</b></span>
            <select name="currentRank" defaultValue={value("currentRank")} required>
              <option value="" disabled>请选择</option>
              {mahjongRanks.map((rank) => <option value={rank} key={rank}>{rank}</option>)}
            </select>
          </label>
          <label className={`${styles.field} ${styles.wide}`}>
            <span>除雀魂外其他平台的最高段位 <b>*</b></span>
            <input name="otherPlatformRank" defaultValue={value("otherPlatformRank")} maxLength={80} placeholder="例如：天凤七段；没有请填“无”" required />
          </label>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="account-heading">
        <div className={styles.sectionHeading}>
          <span><ShieldCheck size={18} /></span>
          <div><p>02</p><h2 id="account-heading">雀魂账号</h2></div>
        </div>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>雀魂游戏昵称 <b>*</b></span>
            <input name="majsoulNickname" defaultValue={value("majsoulNickname")} maxLength={40} placeholder="游戏内昵称" required />
          </label>
          <label className={styles.field}>
            <span>雀魂ID <b>*</b></span>
            <input name="majsoulId" defaultValue={value("majsoulId")} inputMode="numeric" maxLength={40} placeholder="雀魂-好友-我的ID信息" required />
          </label>
        </div>
        <div className={styles.accountNotice}>
          <ShieldCheck size={19} />
          <div><strong>账号归属说明</strong><p>须填本人雀魂账号。全国高校联赛及雀魂各类赛事决赛阶段均需验证雀魂账号与本人绑定的唯一性，本群仅服务在校生。请勿填写密码或验证码。</p></div>
        </div>
        <label className={styles.checkbox}>
          <input name="ownsMajsoulAccount" type="checkbox" defaultChecked={value("ownsMajsoulAccount") === "on"} required />
          <span className={styles.checkmark}><Check size={14} /></span>
          <span>我确认上述雀魂游戏昵称与 ID 对应本人账号 <b>*</b></span>
        </label>
      </section>

      <section className={styles.section} aria-labelledby="goal-heading">
        <div className={styles.sectionHeading}>
          <span><Sparkles size={18} /></span>
          <div><p>03</p><h2 id="goal-heading">需求与方向</h2></div>
        </div>
        <label className={styles.field}>
          <span>想得到的资源或想提高的方向 <b>*</b></span>
          <textarea name="goals" defaultValue={value("goals")} rows={5} minLength={5} maxLength={1000} placeholder="例如：想获得牌谱复盘、科学麻将资料，或提高牌效、防守与场况判断……" required />
          <small>建议写具体场景，方便后续匹配资源。</small>
        </label>
      </section>

      <div className={styles.consentArea}>
        <label className={styles.checkbox}>
          <input name="privacyConsent" type="checkbox" defaultChecked={value("privacyConsent") === "on"} required />
          <span className={styles.checkmark}><Check size={14} /></span>
          <span>我同意本群为在校生身份核验、赛事组织和训练资源对接收集并使用上述信息。信息仅管理员可见，不会在公开页面展示。 <b>*</b></span>
        </label>
      </div>

      {state.status === "error" && <p className={styles.error} role="alert">{state.message}</p>}
      <div className={styles.actions}>
        <p><ShieldCheck size={15} />请确认信息无误后提交</p>
        <button className="button primary" type="submit" disabled={pending}><Send size={17} />{pending ? "正在提交" : "提交信息"}</button>
      </div>
    </form>
  );
}
