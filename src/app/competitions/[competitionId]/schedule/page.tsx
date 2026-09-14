import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { getCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import { individualStageStandings } from "@/domain/individual-standings";
import { updateScheduleAction, confirmStageAction } from "./actions";

export default async function CompetitionSchedulePage({ params, searchParams }: { params: Promise<{ competitionId: string }>; searchParams?: Promise<{ error?: string }> }) {
  const { competitionId } = await params;
  const error = (await searchParams)?.error;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  // Keep the newest scheduled items at the top, matching the牌谱列表 ordering.
  const schedule = [...(competition.individualSchedule ?? [])].sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt) || b.stage.localeCompare(a.stage) || b.round - a.round || b.tableNumber - a.tableNumber);
  const admin = await isAdmin();
  const settings = competition.individualSettings;
  const confirmation = (["preliminary", "semifinal"] as const).map((stage) => {
    const count = stage === "preliminary"
      ? settings?.stages.preliminary.advancingPlayerCount ?? 0
      : settings?.semifinalAdvancingPlayerCount ?? settings?.stages.semifinal.advancingPlayerCount ?? 0;
    const games = stage === "preliminary" ? settings?.stages.preliminary.matchCountPerPlayer ?? 0 : settings?.stages.semifinal.matchCountPerPlayer ?? 0;
    const completed = competition.matches.filter((match) => match.status === "completed" && match.stage === stage).length;
    const nextStage = stage === "preliminary" ? "semifinal" : "final";
    const generated = schedule.some((table) => table.stage === nextStage);
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
  return <div className="page form-page"><Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link><div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>赛程管理</h1></div></div>{error && <p className="form-error" role="alert">{error}</p>}{admin && <div className="schedule-confirm-actions">{confirmation.map(({ stage, disabled, reason }) => <form action={confirmStageAction} key={stage}><input type="hidden" name="competitionId" value={competition.id} /><input type="hidden" name="stage" value={stage} /><button className="button" type="submit" disabled={disabled}>确认{stage === "preliminary" ? "初赛晋级并生成半决赛" : "半决赛晋级并生成决赛"}</button>{disabled && <small className="form-hint">{reason}</small>}</form>)}</div>}<div className="schedule-editor-list">{schedule.map((table) => <form className="schedule-editor-card" action={admin ? updateScheduleAction : undefined} key={table.id}><input type="hidden" name="competitionId" value={competition.id} /><input type="hidden" name="scheduleId" value={table.id} /><div><strong>{table.stage === "final" ? "决赛" : table.stage === "semifinal" ? "半决赛" : "初赛"}</strong><span>第 {table.round} 轮</span></div><label>时间<input name="scheduledAt" type="datetime-local" defaultValue={table.scheduledAt.slice(0, 16)} readOnly={!admin} required /></label><label>桌次<input name="tableNumber" type="number" min="1" defaultValue={table.tableNumber} readOnly={!admin} required /></label><div className="schedule-player-fields">{[0, 1, 2, 3].map((index) => <label key={index}>选手<select name="participantIds" defaultValue={table.participantIds[index] ?? ""} disabled={!admin} required>{competition.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}</option>)}</select></label>)}</div>{admin && <button className="button primary" type="submit"><Pencil size={15} />保存本桌</button>}</form>)}</div></div>;
}
