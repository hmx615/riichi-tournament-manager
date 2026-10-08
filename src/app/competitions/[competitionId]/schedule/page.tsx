import Link from "next/link";
import { ArrowLeft, FilePlus2, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { getCompetition } from "@/server/competition-repository";
import { isAdmin } from "@/server/auth";
import { publicSiteOrigin } from "@/server/site-origin";
import { IndividualWeekSettlementPanel } from "@/components/individual-tournament-panels";
import { individualWeekOf } from "@/domain/individual-standings";
import { formatTableTimeInput } from "@/domain/schedule-negotiation";
import { ScheduleNegotiationPanel } from "@/components/schedule-negotiation-panel";
import { updateScheduleAction } from "./actions";

export default async function CompetitionSchedulePage({ params, searchParams }: {
  params: Promise<{ competitionId: string }>;
  searchParams?: Promise<{ error?: string; saved?: string; stage?: string; round?: string; week?: string; table?: string; status?: string }>;
}) {
  const { competitionId } = await params;
  const query = await searchParams;
  const error = query?.error;
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const stageFilter = ["preliminary", "final"].includes(query?.stage ?? "") ? query!.stage! as "preliminary" | "final" : "";
  const statusFilter = ["scheduled", "completed", "cancelled"].includes(query?.status ?? "") ? query!.status! as "scheduled" | "completed" | "cancelled" : "";
  const weekFilter = query?.week && /^\d+$/.test(query.week) ? Number(query.week) : 0;
  const tableFilter = query?.table && /^\d+$/.test(query.table) ? Number(query.table) : 0;
  const schedule = [...(competition.individualSchedule ?? [])]
    .filter((table) => (!stageFilter || table.stage === stageFilter) && (!statusFilter || table.status === statusFilter) && (!weekFilter || individualWeekOf(table) === weekFilter) && (!tableFilter || table.tableNumber === tableFilter))
    .sort((a, b) => (individualWeekOf(a) - individualWeekOf(b)) || a.round - b.round || a.tableNumber - b.tableNumber);
  const admin = await isAdmin();
  const negotiationPath = `/negotiation?competition=${encodeURIComponent(competition.id)}`;
  // 站内按钮用相对路径（在哪个域名访问就跳哪个），发给选手的链接固定用对外入口域名。
  const negotiationLink = `${await publicSiteOrigin()}${negotiationPath}`;
  const byes = (competition.individualByes ?? []).filter((bye) => !stageFilter || bye.stage === stageFilter);
  return <div className="page form-page">
    <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
    <div className="page-heading"><div><p className="eyebrow">{competition.code}</p><h1>赛程管理</h1></div><Link className="button" href={negotiationPath}><FilePlus2 size={16} />选手时间确认入口</Link></div>
    {query?.saved === "1" && <p className="form-message success" role="status">赛程与协商记录已保存。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {byes.length > 0 && <p className="field-note">轮空（少打一个半庄）：{byes.map((bye) => competition.participants.find((participant) => participant.id === bye.participantId)?.displayName ?? bye.participantId).join("、")}</p>}
    {admin && <IndividualWeekSettlementPanel competition={competition} compact />}
    {admin && <section className="schedule-negotiation-setup">
      <h2>时间协商</h2>
      <p className="field-note">把下面这条链接发给本届所有选手（一条链接管全部桌次）。选手用选手账号登录后即可确认时间，不再需要口令。</p>
      <input className="negotiation-link-field" readOnly value={negotiationLink} aria-label="本届协商链接" />
    </section>}
    <div className="schedule-editor-list">{schedule.map((table) => <div className="schedule-editor-entry" key={table.id} id={table.id}>
      <form className="schedule-editor-card" action={admin ? updateScheduleAction : undefined}>
        <input type="hidden" name="competitionId" value={competition.id} />
        <input type="hidden" name="scheduleId" value={table.id} />
        <div><strong>{table.stage === "final" ? "决赛" : "初赛"}</strong><span>第 {individualWeekOf(table)} 周 · 第 {table.round} 轮</span></div>
        <label>时间<input name="scheduledAt" type="datetime-local" defaultValue={formatTableTimeInput(table.scheduledAt)} readOnly={!admin} required /></label>
        <label>桌次<input name="tableNumber" type="number" min="1" defaultValue={table.tableNumber} readOnly={!admin} required /></label>
        <div className="schedule-player-fields">{[0, 1, 2, 3].map((index) => <label key={index}>选手<select name="participantIds" defaultValue={table.participantIds[index] ?? ""} disabled={!admin} required>{competition.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}</option>)}</select></label>)}</div>
        {admin && <button className="button primary" type="submit"><Pencil size={15} />保存本桌</button>}
      </form>
      {admin && <ScheduleNegotiationPanel competition={competition} table={table} />}
    </div>)}</div>
  </div>;
}
