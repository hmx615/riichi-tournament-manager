import { confirmStageAction } from "@/app/competitions/[competitionId]/schedule/actions";
import { individualStageStandings } from "@/domain/individual-standings";
import type { Competition } from "@/domain/types";

export function individualStageConfirmation(competition: Competition) {
  const settings = competition.individualSettings;
  const schedule = competition.individualSchedule ?? [];
  return (["preliminary", "semifinal"] as const).map((stage) => {
    const count = stage === "preliminary"
      ? settings?.stages.preliminary.advancingPlayerCount ?? 0
      : settings?.semifinalAdvancingPlayerCount ?? settings?.stages.semifinal.advancingPlayerCount ?? 0;
    const games = stage === "preliminary" ? settings?.stages.preliminary.matchCountPerPlayer ?? 0 : settings?.stages.semifinal.matchCountPerPlayer ?? 0;
    const completed = competition.matches.filter((match) => match.status === "completed" && match.stage === stage).length;
    const generated = schedule.some((table) => table.stage === (stage === "preliminary" ? "semifinal" : "final"));
    let disabled = true;
    let reason = "待设置晋级人数";
    if (count > 0 && games > 0 && completed > 0 && !generated) {
      const available = individualStageStandings(competition, stage).length;
      disabled = available < count;
      reason = disabled ? `还需完成对局（当前可晋级 ${available}/${count} 人）` : "";
    } else if (generated) {
      reason = "下一阶段赛程已生成";
    } else if (count > 0 && games === 0) {
      reason = "待设置本阶段半庄数";
    } else if (count > 0 && completed === 0) {
      reason = "待完成本阶段牌谱";
    }
    return { stage, disabled, reason };
  });
}

/** 阶段晋级确认按钮：按下之后当前阶段才结束，晋级名单和淘汰才生效。 */
export function IndividualStageConfirm({ competition }: { competition: Competition }) {
  return <div className="schedule-confirm-actions">{individualStageConfirmation(competition).map(({ stage, disabled, reason }) => (
    <form action={confirmStageAction} key={stage}>
      <input type="hidden" name="competitionId" value={competition.id} />
      <input type="hidden" name="stage" value={stage} />
      <button className="button" type="submit" disabled={disabled}>确认{stage === "preliminary" ? "初赛晋级并生成半决赛" : "半决赛晋级并生成决赛"}</button>
      {disabled && <small className="form-hint">{reason}</small>}
    </form>
  ))}</div>;
}
