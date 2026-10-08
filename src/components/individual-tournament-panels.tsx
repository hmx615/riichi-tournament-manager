import { Trash2, TriangleAlert } from "lucide-react";
import type { Competition } from "@/domain/types";
import { individualSettingsFor } from "@/domain/competition-format";
import { individualPendingSettlement } from "@/domain/individual-tournament";
import { addAdjustmentAction, deleteAdjustmentAction, settleWeekAction } from "@/app/competitions/[competitionId]/schedule/actions";
import styles from "./individual-tournament-panels.module.css";

/**
 * 每周结算面板：本周牌谱录完就能结算。
 * 淘汰周会按累计积分倒序淘汰末位选手，然后自动生成下一周（或决赛）赛程。
 */
export function IndividualWeekSettlementPanel({ competition, compact = false }: { competition: Competition; compact?: boolean }) {
  const settings = individualSettingsFor(competition);
  const pending = individualPendingSettlement(competition);
  if (!settings) return null;
  if (!pending) {
    const totalWeeks = settings.preliminary.regularWeeks + settings.preliminary.eliminationWeeks;
    return <p className={styles.doneNote}>初赛第 {totalWeeks} 周已经结算完成，后续按赛程推进即可。</p>;
  }
  const nextLabel = pending.next === "final" ? "决赛赛程" : `第 ${pending.week + 1} 周赛程`;
  const actionLabel = pending.kind === "regular"
    ? `结束第 ${pending.week} 周并生成${nextLabel}`
    : `确认淘汰名单并生成${nextLabel}`;
  return <section className={styles.settlement}>
    <div className={styles.settlementHead}>
      <strong><TriangleAlert size={15} />第 {pending.week} 周结算（{pending.kind === "elimination" ? "淘汰周" : "日常周"}）</strong>
      <span>本周 {pending.tables} 桌 · 已录 {pending.recorded} 桌</span>
    </div>
    {pending.kind === "elimination"
      ? <p className={styles.settlementNote}>按初赛累计积分倒序淘汰末 {settings.preliminary.eliminationCountPerWeek} 人，结算后剩余 {pending.remainingCount} 人。</p>
      : <p className={styles.settlementNote}>日常周不淘汰；结算后进入淘汰周，赛程会按最初报名的 {competition.participants.length} 人排出。</p>}
    {pending.leaving.length > 0 && <p className={styles.leaving}>本周结束后淘汰：{pending.leaving.map((item) => `${item.displayName}（${item.points >= 0 ? "+" : ""}${item.points.toFixed(1)}）`).join("、")}</p>}
    <form action={settleWeekAction} className={styles.settlementForm}>
      <input type="hidden" name="competitionId" value={competition.id} />
      <input type="hidden" name="week" value={pending.week} />
      <button className="button primary" type="submit" disabled={!pending.canSettle}>{compact ? "结算本周" : actionLabel}</button>
      {pending.reason && <small className="form-hint">{pending.reason}</small>}
    </form>
  </section>;
}

/** 手工加减分：迟到扣分、误判修正等，只计入所选阶段。 */
export function IndividualAdjustmentPanel({ competition }: { competition: Competition }) {
  const settings = individualSettingsFor(competition);
  if (!settings) return null;
  const adjustments = [...(competition.individualAdjustments ?? [])].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  const nameOf = (participantId: string) => competition.participants.find((participant) => participant.id === participantId)?.displayName ?? participantId;
  return <section className={styles.adjustments}>
    <div className={styles.settlementHead}><strong>手工加减分</strong><span className="table-count">{adjustments.length} 条</span></div>
    <p className={styles.settlementNote}>迟到扣分或赛果修正写在这里，按阶段计入积分榜；淘汰结算会把它一起算进去。</p>
    <form action={addAdjustmentAction} className={styles.adjustmentForm}>
      <input type="hidden" name="competitionId" value={competition.id} />
      <label>选手<select name="participantId" required defaultValue="">{competition.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}</select></label>
      <label>阶段<select name="stage" defaultValue="preliminary"><option value="preliminary">初赛</option><option value="final">决赛</option></select></label>
      <label>分值<input name="points" type="number" step="0.1" placeholder="负数为扣分" required /></label>
      <label className={styles.reasonField}>原因<input name="reason" maxLength={60} placeholder="例如：第 3 周迟到 5 分钟" required /></label>
      <button className="button" type="submit">记一条</button>
    </form>
    {adjustments.length > 0 && <ul className={styles.adjustmentList}>{adjustments.map((item) => <li key={item.id}>
      <span>{item.stage === "preliminary" ? "初赛" : "决赛"} · {nameOf(item.participantId)} · <strong className={item.points >= 0 ? "positive" : "negative"}>{item.points >= 0 ? "+" : ""}{item.points}</strong> · {item.reason}</span>
      <form action={deleteAdjustmentAction}><input type="hidden" name="competitionId" value={competition.id} /><input type="hidden" name="adjustmentId" value={item.id} /><button className="table-edit-link" type="submit" aria-label={`删除 ${item.reason}`}><Trash2 size={13} /></button></form>
    </li>)}</ul>}
  </section>;
}
