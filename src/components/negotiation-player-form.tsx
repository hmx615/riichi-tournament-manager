"use client";

import { useState } from "react";
import { CheckCircle2, Pencil, Plus, X } from "lucide-react";
import { submitNegotiationAction } from "@/app/negotiation/actions";
import { formatTableTime, formatTableTimeInput } from "@/domain/schedule-negotiation";

const maxTimes = 4;
type Mode = "confirm" | "change_time" | "postpone" | "vote_accept" | "vote_decline";

export type PlayerFormState =
  /** 还没确认法定时间，也没有待表决申请：可以正常选择。 */
  | "needs_action"
  /** 有待表决申请且我还没投票。 */
  | "needs_vote"
  /** 我已经确认法定时间，正在等其他人。 */
  | "confirmed_waiting"
  /** 我已经就当前申请投过票，正在等其他人。 */
  | "voted"
  /** 申请是我提的，等其他人表决。 */
  | "proposer_waiting"
  /** 本桌时间已经确定。 */
  | "settled"
  /** 还没到开放协商的时间。 */
  | "locked_until_open"
  /** 本桌牌谱已经录入。 */
  | "finished";

export function NegotiationPlayerForm({
  competitionId,
  scheduleId,
  asParticipantId,
  state,
  hint,
  proposalType,
  proposedTimes,
  myVoteStatus,
  canPostpone,
  postponeBlockedReason,
  legalTime,
  onlyEarlier,
  noPostpone,
  opensAtLabel,
}: {
  competitionId: string;
  scheduleId: string;
  /** 管理员代选手操作时带上要扮演的选手 ID；普通选手不传。 */
  asParticipantId?: string;
  state: PlayerFormState;
  hint: string;
  proposalType: "change_time" | "postpone" | null;
  proposedTimes: string[];
  myVoteStatus: "accepted" | "declined" | null;
  canPostpone: boolean;
  postponeBlockedReason: string;
  /** 本桌的法定时间，用于淘汰周限制"只能提前"。 */
  legalTime: string;
  onlyEarlier: boolean;
  noPostpone: boolean;
  /** 这一场什么时候开放协商，格式化好的中文时间。 */
  opensAtLabel?: string;
}) {
  const cannotPostpone = canPostpone && !noPostpone;
  const postponeReason = noPostpone ? "淘汰周不允许顺延比赛，只能提前进行" : postponeBlockedReason;
  const voting = state === "needs_vote" || state === "voted";
  const editable = state === "needs_action" || state === "needs_vote";
  const [editing, setEditing] = useState(editable);
  const [mode, setMode] = useState<Mode>(voting
    ? (myVoteStatus === "declined" ? "vote_decline" : "vote_accept")
    : "confirm");
  const [times, setTimes] = useState<string[]>(["", "", "", ""]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [cannotAttend, setCannotAttend] = useState(myVoteStatus === "declined");

  // 还没到开放协商的时间：只说明什么时候开，不给任何可点的操作。
  if (state === "locked_until_open") {
    return <div className="negotiation-player-form locked">
      <p className="negotiation-state-hint">这一场还没有开放协商{opensAtLabel ? `，${opensAtLabel} 起可以提交` : ""}。</p>
    </div>;
  }

  // 没有可操作的内容（已确认、已投票、申请待他人表决、本桌已定）：只展示状态。
  if (!editing) {
    return <div className="negotiation-player-form locked">
      <p className="negotiation-state-hint">{hint}</p>
      <div className="access-code-row">
        <span className="field-note">当前没有需要你操作的内容。</span>
        {editable || state === "confirmed_waiting" || state === "voted"
          ? <button className="button" type="button" onClick={() => setEditing(true)}><Pencil size={14} />修改我的回应</button>
          : null}
        <button className="button primary" type="button" disabled><CheckCircle2 size={16} />确认提交</button>
      </div>
    </div>;
  }

  const toggleSelected = (time: string) => setSelectedTimes((current) => current.includes(time) ? current.filter((item) => item !== time) : [...current, time]);
  const updateTime = (index: number, value: string) => setTimes((current) => current.map((item, position) => position === index ? value : item));
  const removeTime = (index: number) => setTimes((current) => current.length === 1 ? [""] : current.filter((_, position) => position !== index));
  const option = (value: Mode, label: string, disabled = false, note?: string) => <label className={mode === value ? "checked" : ""}>
    <input type="radio" name="modeChoice" checked={mode === value} disabled={disabled} onChange={() => setMode(value)} />
    <span>{label}{note && <em>{note}</em>}</span>
  </label>;
  return <form className="negotiation-player-form" action={submitNegotiationAction} autoComplete="off">
    <input type="hidden" name="competitionId" value={competitionId} />
    <input type="hidden" name="scheduleId" value={scheduleId} />
    {asParticipantId && <input type="hidden" name="asParticipantId" value={asParticipantId} />}
    <input type="hidden" name="mode" value={mode} />
    {voting ? <>
      <p>本桌有人申请{proposalType === "postpone" ? "顺延一周" : "更换开打时间"}，需要另外三人一致同意；只要一人拒绝，就回到「确认法定时间」，之前确认过的状态会保留。</p>
      {proposalType === "change_time" ? <>
        <fieldset className="choice-group">
          <legend>勾选你能参加的时间（可多选，最终取所有人共同能参加的最早一个）</legend>
          {proposedTimes.map((time) => <label className={selectedTimes.includes(time) ? "checked" : ""} key={time}>
            <input type="checkbox" name="selectedTime" value={time} checked={selectedTimes.includes(time)} disabled={cannotAttend} onChange={() => toggleSelected(time)} />
            <span>{formatTableTime(time)}</span>
          </label>)}
          <label className={cannotAttend ? "checked" : ""}>
            <input type="checkbox" checked={cannotAttend} onChange={(event) => { setCannotAttend(event.target.checked); setMode(event.target.checked ? "vote_decline" : "vote_accept"); }} />
            <span>以上时间我都不行（拒绝这次更换）</span>
          </label>
        </fieldset>
        <input type="hidden" name="cannotAttendAny" value={cannotAttend ? "1" : "0"} />
        <label className="negotiation-field">备注（选填）<input name="note" type="text" placeholder={cannotAttend ? "例如：这三天都不在本地" : "例如：这三天都可以"} /></label>
      </> : <>
        <fieldset className="choice-group">
          <legend>你的表决</legend>
          {option("vote_accept", "同意顺延一周")}
          {option("vote_decline", "拒绝顺延，按法定时间开打")}
        </fieldset>
        {mode === "vote_decline" && <label className="negotiation-field">拒绝原因（选填）<input name="note" type="text" placeholder="例如：只有这周有空" /></label>}
      </>}
    </> : <>
      <fieldset className="choice-group">
        <legend>请选择你的回应</legend>
        {option("confirm", "同意按法定时间开打")}
        {option("change_time", "申请更换开打时间", false, "需要另外三人同意")}
        {option("postpone", cannotPostpone ? "申请顺延到下周同一时间" : "申请顺延到下周同一时间（本场不可再用）", !cannotPostpone, postponeReason)}
      </fieldset>
      {mode === "change_time" && <div className="time-slots">
        <span className="time-slots-title">{onlyEarlier
          ? `你希望提前到什么时候（最多 4 个，取最早的一个生效；不能晚于法定时间 ${formatTableTime(legalTime)}）`
          : "你希望的开打时间（最多 4 个，取最早的一个生效；点 × 删掉多余的行）"}</span>
        {times.map((value, index) => <div className="time-slot" key={index}>
          <input name="proposedTime" type="datetime-local" value={value} max={onlyEarlier ? formatTableTimeInput(legalTime) : undefined} onChange={(event) => updateTime(index, event.target.value)} />
          <button type="button" className="time-slot-remove" onClick={() => removeTime(index)} aria-label={`删除时间 ${index + 1}`}><X size={14} /></button>
        </div>)}
        {times.length < maxTimes && <button type="button" className="button time-slot-add" onClick={() => setTimes((current) => [...current, ""])}><Plus size={14} />再加一个时间</button>}
      </div>}
      {mode === "postpone" && <label className="negotiation-field">顺延原因（必填，会记录在协商历史里）<input name="note" type="text" placeholder="例如：本周出差，只有下周有空" required /></label>}
      {mode === "change_time" && <label className="negotiation-field">申请说明（选填，另外三人会看到）<input name="note" type="text" placeholder="例如：周六晚上更方便" /></label>}
      {mode === "confirm" && <label className="negotiation-field">备注（选填）<input name="note" type="text" placeholder="例如：我会提前到场" /></label>}
    </>}
    <div className="access-code-row">
      <button className="button primary" type="submit"><CheckCircle2 size={16} />确认提交</button>
    </div>
  </form>;
}
