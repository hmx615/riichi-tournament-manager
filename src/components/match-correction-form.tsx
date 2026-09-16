import Link from "next/link";
import { Save } from "lucide-react";
import { DeleteMatchButton } from "@/components/delete-match-button";
import { updateMatchSeatsAction } from "@/app/competitions/[competitionId]/matches/[matchNumber]/actions";
import type { Competition, MatchRecord } from "@/domain/types";

const winds = ["东", "南", "西", "北"];

export function MatchCorrectionForm({ competition, match, backHref, backLabel }: {
  competition: Competition;
  match: MatchRecord;
  backHref: string;
  backLabel: string;
}) {
  const participantById = new Map(competition.participants.map((participant) => [participant.id, participant]));
  const table = match.scheduleId ? competition.individualSchedule?.find((item) => item.id === match.scheduleId) : undefined;
  const selectable = table ? competition.participants.filter((participant) => table.participantIds.includes(participant.id)) : competition.participants;
  return (
    <div className="form-layout">
    <form id="match-correction-form" action={updateMatchSeatsAction}>
      <input name="competitionId" type="hidden" value={competition.id} />
      <input name="matchNumber" type="hidden" value={match.matchNumber} />
      <section className="form-section">
        <div className="form-section-title"><span>1</span><div><h2>原始牌谱</h2><p>原始昵称、终局点数、顺位和比赛积分不会因人工修正而改变。</p></div></div>
        <div className="seat-editor active">
          {[...match.seats].sort((left, right) => left.seat - right.seat).map((seat) => {
            const current = participantById.get(seat.participantId);
            return <div key={seat.seat}>
              <b>{winds[seat.seat]}</b>
              <span className="source-name">{seat.sourceUsername}{seat.assignmentSource === "manual" && <em className="seat-match-note preference" title="人工修正过的座次">人工修正</em>}</span>
              <select name={`participant${seat.seat}`} aria-label={`${winds[seat.seat]}家身份`} defaultValue={seat.participantId} required>
                {selectable.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}</option>)}
              </select>
              <span className="match-state confirmed" style={{ color: current?.color }}>{seat.rank}位 · {seat.competitionPoints >= 0 ? "+" : ""}{seat.competitionPoints.toFixed(1)}</span>
            </div>;
          })}
        </div>
        <label className="field wide"><span>修改原因（必填）</span><textarea name="reason" rows={3} placeholder="例如：牌谱昵称与选手对应关系填错，实际东家为某某。" required /></label>
        {table && <p className="field-note">本场已绑定赛程桌次，四名选手只能确认为该桌名单内的选手；换人请先修改赛程。</p>}
      </section>
      {match.corrections?.length ? <section className="form-section">
        <div className="form-section-title"><span>2</span><div><h2>修正记录</h2></div></div>
        <ul className="correction-history">
          {[...match.corrections].reverse().map((correction) => <li key={`${correction.at}-${correction.reason}`}>
            <strong>{new Date(correction.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</strong>
            <span>{correction.reason}</span>
            <em>{correction.changes.map((change) => `${winds[change.seat]}家 ${change.sourceUsername}：${change.fromParticipantId ? participantById.get(change.fromParticipantId)?.displayName ?? change.fromParticipantId : "未匹配"} → ${participantById.get(change.toParticipantId)?.displayName ?? change.toParticipantId}`).join("；")}</em>
          </li>)}
        </ul>
      </section> : null}
    </form>
    <div className="match-edit-actions">
      <DeleteMatchButton competitionId={competition.id} matchNumber={match.matchNumber} />
      <div><Link className="button" href={backHref}>{backLabel}</Link><button className="button primary" type="submit" form="match-correction-form"><Save size={17} />保存修正</button></div>
    </div>
    </div>
  );
}
