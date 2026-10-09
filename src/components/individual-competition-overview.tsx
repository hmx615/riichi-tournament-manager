import Link from "next/link";
import React from "react";
import { ArrowLeft, Award, BarChart3, CalendarDays, ClipboardList, Diamond, FilePlus2, Medal, Pencil, Settings } from "lucide-react";
import type { Competition } from "@/domain/types";
import { individualSettingsFor } from "@/domain/competition-format";
import { assessMatchQuality } from "@/domain/match-quality";
import type { CompetitionSummary } from "@/server/competition-statistics";
import { PlayerTag } from "@/components/player-tag";
import { StatusPill } from "@/components/status-pill";
import { EliminatedZone } from "@/components/eliminated-zone";
import { IndividualAdjustmentPanel, IndividualWeekSettlementPanel } from "@/components/individual-tournament-panels";
import {
  compareIndividualTiebreak,
  individualActiveStage,
  individualEliminatedPlayers,
  individualStageComplete,
  individualStageStandings,
  individualStageWeeks,
  individualTiebreakRule,
  individualWeekOf,
  individualEliminationZone,
  type IndividualStanding,
} from "@/domain/individual-standings";
import { individualPendingSettlement } from "@/domain/individual-tournament";
import { tableHasParticipant } from "@/domain/scheduled-match";
import { scheduledMatch } from "@/domain/scheduled-match";
import styles from "./competition-overview.module.css";

const stageLabels = { preliminary: "初赛", final: "决赛" } as const;
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function QualityBadges({ competition, matchNumber }: { competition: Competition; matchNumber: number }) {
  const match = competition.matches.find((item) => item.matchNumber === matchNumber);
  if (!match) return null;
  const quality = assessMatchQuality(match);
  return <>
    {quality.matchQuality === "diamond" && <span className={styles.diamondBadge}><Diamond size={12} />钻石局</span>}
    {quality.matchQuality === "gold" && <span className={styles.goldBadge}><Medal size={12} />金分局</span>}
    {quality.fourHorses && <span className={styles.horseBadge}>四马献福</span>}
  </>;
}

export function IndividualCompetitionOverview({ competition, summary, showBackLink = false, admin, canEnterMatches = admin, viewerPersonId = null }: {
  competition: Competition;
  summary: CompetitionSummary;
  showBackLink?: boolean;
  admin: boolean;
  canEnterMatches?: boolean;
  /** 当前访问者绑定的人物；用来只在自己那几桌上亮出「录入牌谱」。 */
  viewerPersonId?: string | null;
}) {
  const completed = competition.matches.filter((match) => match.status === "completed").length;
  const settings = individualSettingsFor(competition);
  const plannedTables = (competition.individualSchedule ?? []).filter((table) => table.status !== "cancelled");
  const eliminated = individualEliminatedPlayers(competition);
  const pending = individualPendingSettlement(competition);
  const activeStage = individualActiveStage(competition);
  const finalComplete = individualStageComplete(competition, "final");

  // 每位选手的当前成绩取自他最后参加的那个阶段：淘汰选手冻结在淘汰那一刻，进决赛的从零重新算。
  const preliminaryRows = individualStageStandings(competition, "preliminary");
  const finalRows = individualStageStandings(competition, "final");
  const rowByParticipant = new Map<string, IndividualStanding>();
  for (const row of preliminaryRows) rowByParticipant.set(row.participant.id, row);
  for (const row of finalRows) rowByParticipant.set(row.participant.id, row);
  const finalRankOf = (participantId: string) => finalComplete ? finalRows.find((row) => row.participant.id === participantId)?.rank : undefined;

  const statusOf = (participantId: string) => {
    const eliminatedWeek = eliminated.get(participantId);
    if (eliminatedWeek) return `第 ${eliminatedWeek} 周淘汰`;
    const rank = finalRankOf(participantId);
    if (rank === 1) return "冠军";
    if (rank === 2) return "亚军";
    if (rank === 3) return "季军";
    if (rank === 4) return "殿军";
    if (finalRows.some((row) => row.participant.id === participantId)) return "决赛";
    return "初赛";
  };

  // 还在比赛的排前面，被淘汰的排在后面并收进淘汰区。
  const sortedPlayers = [...competition.participants].sort((left, right) => {
    const leftEliminated = eliminated.has(left.id) ? 1 : 0;
    const rightEliminated = eliminated.has(right.id) ? 1 : 0;
    const leftRow = rowByParticipant.get(left.id);
    const rightRow = rowByParticipant.get(right.id);
    return leftEliminated - rightEliminated || compareIndividualTiebreak(
      { points: leftRow?.points ?? 0, averageRank: leftRow?.averageRank ?? null, firstPlaceCount: leftRow?.firstPlaceCount ?? 0, secondPlaceCount: leftRow?.secondPlaceCount ?? 0, displayName: left.displayName },
      { points: rightRow?.points ?? 0, averageRank: rightRow?.averageRank ?? null, firstPlaceCount: rightRow?.firstPlaceCount ?? 0, secondPlaceCount: rightRow?.secondPlaceCount ?? 0, displayName: right.displayName },
    );
  });
  const eliminatedStart = sortedPlayers.findIndex((participant) => eliminated.has(participant.id));
  const survivorBoundary = eliminatedStart < 0 ? sortedPlayers.length : eliminatedStart;
  const standingRow = (participant: Competition["participants"][number], index: number) => {
    const status = statusOf(participant.id);
    const row = rowByParticipant.get(participant.id);
    const points = row?.points ?? 0;
    const statusClass = status === "冠军" ? "stage-final champion" : status === "亚军" ? "stage-final runner-up" : status === "季军" ? "stage-final third-place" : status === "决赛" || status === "殿军" ? "stage-final" : status === "初赛" ? "stage-preliminary" : "stage-eliminated";
    const medalClass = status === "冠军" ? "medal-diamond" : status === "亚军" ? "medal-gold" : status === "季军" ? "medal-horse" : status === "殿军" ? "medal-bronze" : "";
    const previous = !eliminated.has(participant.id) && index > 0 ? rowByParticipant.get(sortedPlayers[index - 1].id)?.points ?? 0 : null;
    const gap = previous == null ? null : previous - points;
    const rowClass = eliminated.has(participant.id) ? "eliminated-standing-row" : medalClass ? `medal-row ${medalClass.replace("medal-", "medal-row-")}` : "";
    return <tr key={participant.id} className={rowClass}>
      <td><strong>{index + 1}</strong></td>
      <td><PlayerTag participant={participant} /></td>
      <td className={points >= 0 ? "positive" : "negative"}>{points >= 0 ? "+" : ""}{points.toFixed(1)}</td>
      <td>{row?.adjustmentPoints ? <span className={row.adjustmentPoints >= 0 ? "positive" : "negative"}>{row.adjustmentPoints >= 0 ? "+" : ""}{row.adjustmentPoints.toFixed(1)}</span> : "-"}</td>
      <td>{gap == null ? "-" : gap.toFixed(1)}</td>
      <td>{row?.games ?? 0}</td>
      <td>{row?.averageRank?.toFixed(2) ?? "-"}</td>
      <td>{medalClass
        ? <span className={`stage-status medal ${medalClass}`}>{status === "冠军" ? <Diamond size={12} /> : status === "亚军" ? <Medal size={12} /> : status === "季军" ? <span className="medal-mark">♞</span> : <Award size={12} />}{status}</span>
        : <span className={`stage-status ${statusClass}`}>{status}</span>}</td>
    </tr>;
  };
  // 淘汰周还没结算时，在积分榜上标出这条周结束后会被淘汰的区间。
  const eliminationCount = pending?.kind === "elimination" ? pending.leaving.length : 0;
  const eliminationLineIndex = eliminationCount > 0 ? Math.max(0, survivorBoundary - eliminationCount) : -1;
  const survivorRows = sortedPlayers.slice(0, survivorBoundary).map(standingRow);
  const eliminatedRows = sortedPlayers.slice(survivorBoundary).map((participant, offset) => standingRow(participant, survivorBoundary + offset));
  const eliminationLine = <tr className="elimination-line"><td colSpan={8}>淘汰线（本周结束后淘汰末 {eliminationCount} 人）</td></tr>;

  const stageWeekStatus = (stage: "preliminary" | "final", week: number) => {
    const tables = plannedTables.filter((table) => table.stage === stage && individualWeekOf(table) === week);
    if (!tables.length) return "待排";
    const done = tables.every((table) => table.status === "completed" || Boolean(scheduledMatch(competition, table)));
    if (done) return "已完成";
    return tables.some((table) => table.status === "completed" || Boolean(scheduledMatch(competition, table))) ? "进行中" : "待进行";
  };
  const sealOf = (status: string) => status === "已完成" ? "done" : status === "待排" ? "pending" : status === "待进行" ? "upcoming" : "active";
  // 当前处在哪个阶段：第一个「进行中」的，否则第一个没打完也没排的。
  const currentPhase = (statuses: string[]) => statuses.includes("进行中") ? "进行中" : statuses.find((status) => status === "待进行" || status === "待排") ?? "已完成";

  const lastRegularWeek = settings?.preliminary.regularWeeks ?? 0;
  const lastPreliminaryWeek = lastRegularWeek + (settings?.preliminary.eliminationWeeks ?? 0);
  // 阶段状态取这段周次里"还没打完"的那一周，全部打完才算已完成。
  const phaseStatus = (stage: "preliminary" | "final", weeks: number[]) => {
    const statuses = weeks.map((week) => stageWeekStatus(stage, week));
    if (!statuses.length) return "无";
    if (statuses.every((status) => status === "已完成")) return "已完成";
    return statuses.find((status) => status !== "已完成" && status !== "待排") ?? "待排";
  };
  const regularStatus = phaseStatus("preliminary", Array.from({ length: lastRegularWeek }, (_, index) => index + 1));
  const eliminationStatus = phaseStatus("preliminary", Array.from({ length: Math.max(0, lastPreliminaryWeek - lastRegularWeek) }, (_, index) => lastRegularWeek + index + 1));

  const scheduleGroups = (["preliminary", "final"] as const).flatMap((stage) => individualStageWeeks(competition, stage).map((week) => ({
    stage,
    week,
    label: stage === "final" ? `决赛 · 第 ${week} 周` : `初赛 · 第 ${week} 周${settings && week > settings.preliminary.regularWeeks ? "（淘汰周）" : "（日常周）"}`,
    status: stageWeekStatus(stage, week),
    tables: plannedTables.filter((table) => table.stage === stage && individualWeekOf(table) === week),
  })));

  return <div className="page competition-page">
    {showBackLink && <Link className="back-link" href="/"><ArrowLeft size={16} />返回比赛列表</Link>}
    <div className="page-heading">
      <div><p className="eyebrow">{competition.code} · 个人赛</p><h1>{competition.name}</h1><p>{competition.status === "draft" ? "草稿" : competition.status === "active" ? "进行中" : competition.status === "completed" ? "已完成" : "已归档"} · {competition.participants.length} 名选手 · 已进行 {completed} 个半庄</p></div>
      <div className="heading-actions">
        <Link className="button" href={`/negotiation?competition=${competition.id}`} title="选手在这里确认开打时间"><CalendarDays size={17} />选手时间确认入口</Link>
        {admin && <>
          <Link className="button" href={`/competitions/${competition.id}/negotiation`}><ClipboardList size={17} />协商进度总览</Link>
          <Link className="button" href={`/competitions/${competition.id}/settings`}><Settings size={17} />比赛设置</Link>
          {competition.matches.length > 0 && <Link className="button" href={`/competitions/${competition.id}/data`}><BarChart3 size={17} />查看数据</Link>}
        </>}
      </div>
    </div>
    {settings && <section className="section-block">
      <div className="section-heading"><div><h2>赛制</h2></div><span className="table-count">同分排序：{individualTiebreakRule}</span></div>
      <ul className="workflow">
        <li className={`workflow-stage workflow-${sealOf(regularStatus)}${regularStatus === currentPhase([regularStatus, eliminationStatus, stageWeekStatus("final", 1)]) ? " is-current" : ""}`}>
          <b>1</b><div><strong>初赛 · 日常周 <em className="stage-seal">{regularStatus}</em></strong><small>第 1–{settings.preliminary.regularWeeks} 周 · 每周 {settings.preliminary.matchesPerPlayerPerWeek} 半庄 · 随机配桌、不淘汰</small></div>
        </li>
        <li className={`workflow-stage workflow-${sealOf(eliminationStatus)}${eliminationStatus === currentPhase([regularStatus, eliminationStatus, stageWeekStatus("final", 1)]) ? " is-current" : ""}`}>
          <b>2</b><div><strong>初赛 · 淘汰周 <em className="stage-seal">{eliminationStatus}</em></strong><small>第 {settings.preliminary.regularWeeks + 1}–{settings.preliminary.regularWeeks + settings.preliminary.eliminationWeeks} 周 · 每周 {settings.preliminary.matchesPerPlayerPerWeek} 半庄 · 每周结算淘汰末 {settings.preliminary.eliminationCountPerWeek} 人</small></div>
        </li>
        <li className={`workflow-stage workflow-${sealOf(stageWeekStatus("final", 1))}${stageWeekStatus("final", 1) === currentPhase([regularStatus, eliminationStatus, stageWeekStatus("final", 1)]) ? " is-current" : ""}`}>
          <b>3</b><div><strong>决赛 <em className="stage-seal">{stageWeekStatus("final", 1)}</em></strong><small>{settings.preliminary.finalistCount} 人 · 每人 {settings.final.matchCountPerPlayer} 半庄 · 积分清零重计</small></div>
        </li>
      </ul>
      {(competition.individualByes ?? []).length > 0 && <p className="field-note">轮空（本阶段少打一个半庄）：{["preliminary", "final"].flatMap((stage) => {
        const names = (competition.individualByes ?? []).filter((bye) => bye.stage === stage)
          .map((bye) => competition.participants.find((participant) => participant.id === bye.participantId)?.displayName ?? bye.participantId);
        return names.length ? [`${stageLabels[stage as "preliminary" | "final"]} ${names.join("、")}`] : [];
      }).join("；")}</p>}
    </section>}
    <section className="standings">
      <div className="section-heading"><div><h2>个人积分榜</h2><p className="section-note">{activeStage === "final" ? "决赛积分已清零重计；被淘汰选手冻结在淘汰时的初赛积分。" : "初赛累计积分，淘汰周结束后按积分倒序淘汰末位。"}</p></div><span className="table-count">{sortedPlayers.length} 人</span></div>
      <div className="table-wrap"><table className="match-table individual-standings-table"><thead><tr><th>排名</th><th>选手</th><th>积分</th><th>加减分</th><th>与上一名差</th><th>已打半庄</th><th>平均顺位</th><th>状态</th></tr></thead><tbody>
        {survivorRows.map((row, index) => <React.Fragment key={row.key}>{eliminationLineIndex >= 0 && index === eliminationLineIndex ? eliminationLine : null}{row}</React.Fragment>)}
        {eliminationLineIndex >= 0 && eliminationLineIndex === survivorRows.length && eliminationLine}
        {eliminatedRows.length > 0 && <EliminatedZone>{eliminatedRows}</EliminatedZone>}
      </tbody></table></div>
      {admin && <IndividualAdjustmentPanel competition={competition} />}
    </section>
    <section className="section-block">
      <div className="section-heading"><div><h2>赛程</h2></div><span className="table-count">已进行 {completed} 个半庄</span></div>
      {admin && <IndividualWeekSettlementPanel competition={competition} />}
      {scheduleGroups.length ? scheduleGroups.map((group) => <section className="schedule-stage-group" key={`${group.stage}-${group.week}`}>
        <h4>{group.label} <em className={`stage-seal stage-seal-${sealOf(group.status)}`}>{group.status}</em></h4>
        <div className="individual-schedule-grid">{group.tables.map((table) => {
          const match = scheduledMatch(competition, table);
          const done = table.status === "completed" || Boolean(match);
          return <article className={`individual-schedule-card${done ? " schedule-completed" : ""}`} key={table.id}>
            <header><strong>{dateFormatter.format(new Date(table.scheduledAt))}</strong><span>{table.stage === "final" ? "决赛" : "初赛"} · 第 {table.round} 轮 · A{table.tableNumber}</span></header>
            <div className="individual-schedule-players">{(match ? match.seats.map((seat) => seat.participantId) : table.participantIds).map((id) => {
              const participant = competition.participants.find((item) => item.id === id);
              return <span style={{ "--player-color": participant?.color } as React.CSSProperties} key={id}>{participant?.displayName ?? id}</span>;
            })}</div>
            <footer>{done
              ? <><strong className="schedule-done">已录入牌谱</strong>{admin && match && <Link className="table-edit-link" href={`/competitions/${competition.id}/matches/${match.matchNumber}`}><Pencil size={14} />查看</Link>}</>
              : canEnterMatches && (admin || (viewerPersonId && tableHasParticipant(competition, table, viewerPersonId))) ? <Link className="button primary" href={`/competitions/${competition.id}/matches/new?scheduleId=${encodeURIComponent(table.id)}`}>录入牌谱</Link> : null}</footer>
          </article>;
        })}</div>
      </section>) : <article className="individual-schedule-card schedule-pending-card"><header><strong>赛程</strong></header><div className="schedule-pending-label">待排</div></article>}
      <Link className="button" href={`/competitions/${competition.id}/matches`}>查看牌谱记录</Link>
    </section>
  </div>;
}

export function IndividualCompetitionData({ competition, summary, week = 0 }: { competition: Competition; summary: CompetitionSummary; week?: number }) {
  const rateLabel = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`;
  const settings = individualSettingsFor(competition);
  const activeStage = individualActiveStage(competition);
  const weeks = individualStageWeeks(competition, activeStage);
  const rowFor = (participantId: string) => {
    const finalRows = individualStageStandings(competition, "final", week || undefined);
    const preliminaryRows = individualStageStandings(competition, "preliminary", week || undefined);
    return finalRows.find((row) => row.participant.id === participantId) ?? preliminaryRows.find((row) => row.participant.id === participantId) ?? null;
  };
  const sortedPlayers = [...competition.participants].sort((left, right) => {
    const leftRow = rowFor(left.id);
    const rightRow = rowFor(right.id);
    return compareIndividualTiebreak(
      { points: leftRow?.points ?? 0, averageRank: leftRow?.averageRank ?? null, firstPlaceCount: leftRow?.firstPlaceCount ?? 0, secondPlaceCount: leftRow?.secondPlaceCount ?? 0, displayName: left.displayName },
      { points: rightRow?.points ?? 0, averageRank: rightRow?.averageRank ?? null, firstPlaceCount: rightRow?.firstPlaceCount ?? 0, secondPlaceCount: rightRow?.secondPlaceCount ?? 0, displayName: right.displayName },
    );
  });
  return <section className="section-block">
    <div className="section-heading"><div><h2>个人赛数据总览</h2><p className="section-note">同分排序：{individualTiebreakRule}</p></div><span className="table-count">{sortedPlayers.length} 人</span></div>
    {weeks.length > 1 && <div className="round-snapshot-bar">
      <span>积分榜快照</span>
      <Link className={week === 0 ? "active" : ""} href={`/competitions/${competition.id}/data`}>全部</Link>
      {weeks.map((value) => <Link className={week === value ? "active" : ""} key={value} href={`/competitions/${competition.id}/data?week=${value}`}>第 {value} 周</Link>)}
      <em>{week > 0 ? `显示第 ${week} 周结束时（含之前各周）的积分` : "显示当前完整积分"}</em>
    </div>}
    <div className="table-wrap"><table className="match-table"><thead><tr><th>排名</th><th>选手</th><th>当前积分</th><th>加减分</th><th>半庄数</th><th>平均顺位</th><th>顺位分布</th><th>平均 Rating</th><th>和率</th><th>铳率</th><th>详细数据</th></tr></thead><tbody>{sortedPlayers.map((participant, index) => { const row = rowFor(participant.id); const rankCounts = [1, 2, 3, 4].map((rank) => competition.matches.reduce((count, match) => count + (match.seats.find((seat) => seat.participantId === participant.id)?.rank === rank ? 1 : 0), 0)); const ratings = competition.matches.flatMap((match) => (match.nagaRatings ?? []).filter((rating) => match.seats.find((seat) => seat.participantId === participant.id)?.seat === Number(rating.participantId)).map((rating) => rating.rating)); const averageRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null; const total = row?.points ?? 0; return <tr key={participant.id}><td><strong>{index + 1}</strong></td><td><PlayerTag participant={participant} /></td><td className={total >= 0 ? "positive" : "negative"}>{total >= 0 ? "+" : ""}{total.toFixed(1)}</td><td>{row?.adjustmentPoints ? <span className={row.adjustmentPoints >= 0 ? "positive" : "negative"}>{row.adjustmentPoints >= 0 ? "+" : ""}{row.adjustmentPoints.toFixed(1)}</span> : "-"}</td><td>{row?.games ?? 0}</td><td>{row?.averageRank?.toFixed(2) ?? "-"}</td><td>{rankCounts.join(" / ")}</td><td>{averageRating?.toFixed(1) ?? "-"}</td><td>{rateLabel(summary[participant.id]?.["和牌率"])}</td><td>{rateLabel(summary[participant.id]?.["放铳率"])}</td><td><Link className="table-edit-link" href={`/competitions/${competition.id}/data/${participant.id}`}>详细数据</Link></td></tr>; })}</tbody></table></div>
    {settings && (["preliminary", "final"] as const).map((stage) => { const rows = week > 0 ? individualStageStandings(competition, stage, week) : individualStageStandings(competition, stage); if (!rows.length) return null;
      // 淘汰区只对初赛有意义：排名末尾几名的积分一结算就会被淘汰。
      const dangerZone = stage === "preliminary" ? individualEliminationZone(rows, settings.preliminary.eliminationCountPerWeek) : new Set<string>();
      return <div className="table-wrap" key={stage}><h3>{stageLabels[stage]}积分榜{week > 0 ? `（第 ${week} 周结束时）` : ""}</h3><table className="match-table"><thead><tr><th>排名</th><th>选手</th><th>积分</th><th>加减分</th><th>半庄数</th><th>平均顺位</th><th>一位/二位</th><th>状态</th></tr></thead><tbody>{rows.map((row) => { const inZone = dangerZone.has(row.participant.id); return <tr key={row.participant.id} className={inZone ? "elimination-zone" : undefined}><td><strong>{row.rank}</strong></td><td><PlayerTag participant={row.participant} /></td><td>{row.points >= 0 ? "+" : ""}{row.points.toFixed(1)}</td><td>{row.adjustmentPoints ? `${row.adjustmentPoints >= 0 ? "+" : ""}${row.adjustmentPoints.toFixed(1)}` : "-"}</td><td>{row.games}</td><td>{row.averageRank?.toFixed(2) ?? "-"}</td><td>{row.firstPlaceCount} / {row.secondPlaceCount}</td><td>{row.eliminated ? <span className="eliminated-tag">已淘汰</span> : inZone ? <span className="elimination-tag">淘汰区</span> : "-"}</td></tr>; })}</tbody></table></div>; })}
  </section>;
}
