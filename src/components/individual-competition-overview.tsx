import Link from "next/link";
import React from "react";
import { ArrowLeft, Award, BarChart3, CalendarDays, Diamond, FilePlus2, Medal, Pencil, Settings } from "lucide-react";
import type { Competition } from "@/domain/types";
import { individualSettingsFor } from "@/domain/competition-format";
import { assessMatchQuality } from "@/domain/match-quality";
import type { CompetitionSummary } from "@/server/competition-statistics";
import { PlayerTag } from "@/components/player-tag";
import { StatusPill } from "@/components/status-pill";
import { EliminatedZone } from "@/components/eliminated-zone";
import { IndividualStageConfirm } from "@/components/individual-stage-confirm";
import { compareIndividualTiebreak, individualActiveStage, individualCurrentPoints, individualStageComplete, individualStageRounds, individualStageSnapshot, individualStageStandings, individualTiebreakRule } from "@/domain/individual-standings";
import { scheduledMatch } from "@/domain/scheduled-match";
import styles from "./competition-overview.module.css";

const stageLabels = { preliminary: "初赛", semifinal: "半决赛", final: "决赛" } as const;
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

export function IndividualCompetitionOverview({ competition, summary, showBackLink = false, admin }: {
  competition: Competition;
  summary: CompetitionSummary;
  showBackLink?: boolean;
  admin: boolean;
}) {
  const completed = competition.matches.filter((match) => match.status === "completed").length;
  const settings = individualSettingsFor(competition);
  const plannedTables = competition.individualSchedule ?? [];
  const stageOrder = ["final", "semifinal", "preliminary"] as const;
  const stageComplete = (stage: "preliminary" | "semifinal" | "final") => individualStageComplete(competition, stage);
  // 只有管理员按下“确认晋级”按钮（下一阶段赛程已经生成）之后，当前阶段才算真正结束，淘汰才生效。
  const nextStageOf = { preliminary: "semifinal", semifinal: "final" } as const;
  const stageConfirmed = (stage: "preliminary" | "semifinal" | "final") => stage === "final" || plannedTables.some((table) => table.stage === nextStageOf[stage]);
  const eliminated = new Set<string>();
  const eliminatedAt = new Map<string, "preliminary" | "semifinal">();
  for (const stage of ["preliminary", "semifinal"] as const) {
    if (!stageComplete(stage) || !stageConfirmed(stage)) continue;
    const stageMatches = competition.matches.filter((match) => match.status === "completed" && match.stage === stage);
    const advancing = individualStageStandings(competition, stage).filter((row) => row.advancing).map((row) => row.participant.id);
    const stagePlayers = new Set(stageMatches.flatMap((match) => match.seats.map((seat) => seat.participantId)));
    if (advancing.length > 0) stagePlayers.forEach((participantId) => {
      if (advancing.includes(participantId)) return;
      eliminated.add(participantId);
      eliminatedAt.set(participantId, stage);
    });
  }
  const finalComplete = stageComplete("final");
  const finalRanks = finalComplete ? individualStageStandings(competition, "final") : [];
  const currentStage = (participantId: string) => {
    if (eliminated.has(participantId)) return eliminatedAt.get(participantId) === "semifinal" ? "半决赛淘汰" : "初赛淘汰";
    if (finalComplete) {
      const rank = finalRanks.find((row) => row.participant.id === participantId)?.rank;
      if (rank === 1) return "冠军";
      if (rank === 2) return "亚军";
      if (rank === 3) return "季军";
      if (rank === 4) return "殿军";
    }
    if (competition.matches.some((match) => match.stage === "final" && match.seats.some((seat) => seat.participantId === participantId)) || plannedTables.some((table) => table.stage === "final" && table.participantIds.includes(participantId))) return "决赛";
    if (competition.matches.some((match) => match.stage === "semifinal" && match.seats.some((seat) => seat.participantId === participantId)) || plannedTables.some((table) => table.stage === "semifinal" && table.participantIds.includes(participantId))) return "半决赛";
    return "初赛";
  };
  const activeStage = individualActiveStage(competition);
  const stageAdvancingCount = activeStage === "preliminary" ? settings?.stages.preliminary.advancingPlayerCount ?? 0 : activeStage === "semifinal" ? settings?.semifinalAdvancingPlayerCount ?? settings?.stages.semifinal.advancingPlayerCount ?? 0 : 0;
  const activeStageComplete = stageComplete(activeStage);
  const stageStatus = (stage: "preliminary" | "semifinal" | "final") => stageComplete(stage) ? (stageConfirmed(stage) ? "已完成" : "待确认晋级") : competition.matches.some((match) => match.status === "completed" && match.stage === stage) || stage === activeStage ? "进行中" : "待进行";
  const stageSeal = (status: string) => status === "已完成" ? "done" : status === "待进行" ? "pending" : "active";
  // 当前积分：晋级进入新阶段后清零重新开始；被淘汰的选手冻结在淘汰那一刻。
  const totals = individualCurrentPoints(competition, activeStage);
  // 名次分组：还在比赛的排在最前，然后是半决赛淘汰（固定 5-8 名），最后是初赛淘汰（固定 9-16 名）。
  const standingsGroup = (participantId: string) => eliminatedAt.get(participantId) === "semifinal" ? 1 : eliminatedAt.get(participantId) === "preliminary" ? 2 : 0;
  // 同分破平：积分 → 平均顺位 → 一位次数 → 二位次数 → 姓名（取该选手最后参加的那个阶段的数据）。
  const stageRows = new Map<string, ReturnType<typeof individualStageStandings>[number]>();
  for (const stage of ["preliminary", "semifinal", "final"] as const) {
    for (const row of individualStageStandings(competition, stage)) stageRows.set(row.participant.id, row);
  }
  const tiebreakOf = (participantId: string, displayName: string) => {
    const row = stageRows.get(participantId);
    return {
      points: totals.get(participantId) ?? 0,
      averageRank: row?.averageRank ?? null,
      firstPlaceCount: row?.firstPlaceCount ?? 0,
      secondPlaceCount: row?.secondPlaceCount ?? 0,
      displayName,
    };
  };
  const sortedPlayers = [...competition.participants].sort((left, right) =>
    standingsGroup(left.id) - standingsGroup(right.id)
    || compareIndividualTiebreak(tiebreakOf(left.id, left.displayName), tiebreakOf(right.id, right.displayName)));
  const eliminatedStart = sortedPlayers.findIndex((participant) => eliminated.has(participant.id));
  const standingRow = (participant: Competition["participants"][number], index: number) => {
    const status = currentStage(participant.id);
    const statusClass = status === "冠军" ? "stage-final champion" : status === "亚军" ? "stage-final runner-up" : status === "季军" ? "stage-final third-place" : status === "决赛" ? "stage-final" : status === "半决赛" ? "stage-semifinal" : status === "初赛" ? "stage-preliminary" : "stage-eliminated";
    // 前四名沿用“金钻马”的视觉语言：冠军钻石、亚军金、季军马，殿军补一个同款铜色。
    const medalClass = status === "冠军" ? "medal-diamond" : status === "亚军" ? "medal-gold" : status === "季军" ? "medal-horse" : status === "殿军" ? "medal-bronze" : "";
    // 已淘汰选手积分冻结在淘汰那一刻，与还在比赛的选手不在同一刻度，不再显示分差。
    const previous = !eliminated.has(participant.id) && index > 0 ? totals.get(sortedPlayers[index - 1].id) ?? 0 : null;
    const gap = previous == null ? null : previous - (totals.get(participant.id) ?? 0);
    const points = totals.get(participant.id) ?? 0;
    const rowClass = eliminated.has(participant.id) ? "eliminated-standing-row" : medalClass ? `medal-row ${medalClass.replace("medal-", "medal-row-")}` : "";
    return <tr key={participant.id} className={rowClass}>
      <td><strong>{index + 1}</strong></td>
      <td><PlayerTag participant={participant} /></td>
      <td className={points >= 0 ? "positive" : "negative"}>{points >= 0 ? "+" : ""}{points.toFixed(1)}</td>
      <td>{gap == null ? "-" : gap.toFixed(1)}</td>
      <td>{summary[participant.id]?.["对局数"] ?? 0}</td>
      <td>{summary[participant.id]?.["平均顺位"]?.toFixed(2) ?? "-"}</td>
      <td>{medalClass
        ? <span className={`stage-status medal ${medalClass}`}>{status === "冠军" ? <Diamond size={12} /> : status === "亚军" ? <Medal size={12} /> : status === "季军" ? <span className="medal-mark">♞</span> : <Award size={12} />}{status}</span>
        : <span className={`stage-status ${statusClass}`}>{status}</span>}</td>
    </tr>;
  };
  const survivorBoundary = eliminatedStart < 0 ? sortedPlayers.length : eliminatedStart;
  const survivorRows = sortedPlayers.slice(0, survivorBoundary).map(standingRow);
  const eliminatedRows = sortedPlayers.slice(survivorBoundary).map((participant, offset) => standingRow(participant, survivorBoundary + offset));
  const showQualificationLine = !activeStageComplete && stageAdvancingCount > 0 && stageAdvancingCount <= survivorRows.length;
  const qualificationLine = <tr className="qualification-line"><td colSpan={7}>晋级线</td></tr>;
  return <div className="page competition-page">
    {showBackLink && <Link className="back-link" href="/"><ArrowLeft size={16} />返回比赛列表</Link>}
    <div className="page-heading">
      <div><p className="eyebrow">{competition.code} · 个人赛</p><h1>{competition.name}</h1><p>{competition.status === "draft" ? "草稿" : competition.status === "active" ? "进行中" : competition.status === "completed" ? "已完成" : "已归档"} · {competition.participants.length} 名选手 · 已进行 {completed} 个半庄</p></div>
      <div className="heading-actions">
        <Link className="button" href={`/negotiation?competition=${competition.id}`} title="选手在这里输入口令确认开打时间"><CalendarDays size={17} />选手时间确认入口</Link>
        {admin && <>
          <Link className="button" href={`/competitions/${competition.id}/settings`}><Settings size={17} />比赛设置</Link>
          {competition.matches.length > 0 && <Link className="button" href={`/competitions/${competition.id}/data`}><BarChart3 size={17} />查看数据</Link>}
        </>}
      </div>
    </div>
    <section className="standings">
      <div className="section-heading"><div><h2>个人积分榜</h2></div></div>
      <div className="table-wrap"><table className="match-table individual-standings-table"><thead><tr><th>排名</th><th>选手</th><th>积分</th><th>与上一名差</th><th>已打半庄</th><th>平均顺位</th><th>状态</th></tr></thead><tbody>
        {survivorRows.map((row, index) => <React.Fragment key={row.key}>{showQualificationLine && index === stageAdvancingCount && qualificationLine}{row}</React.Fragment>)}
        {showQualificationLine && stageAdvancingCount === survivorRows.length && qualificationLine}
        {eliminatedRows.length > 0 && <EliminatedZone>{eliminatedRows}</EliminatedZone>}
      </tbody></table></div>
    </section>
    <section className="section-block">
      <div className="section-heading"><div><h2>赛程</h2></div><span className="table-count">已进行 {completed} 个半庄</span></div>
      {admin && <IndividualStageConfirm competition={competition} />}
      {settings && <ul className="workflow">
        <li className={`workflow-stage workflow-${stageSeal(stageStatus("preliminary"))}`}><b>1</b><div><strong>初赛 <em className="stage-seal">{stageStatus("preliminary")}</em></strong><small>{settings.stages.preliminary.matchCountPerPlayer} 半庄/人{(settings.stages.preliminary.advancingPlayerCount ?? 0) > 0 ? ` · ${settings.stages.preliminary.advancingPlayerCount} 人晋级半决赛` : ""}{(settings.preliminaryDirectFinalPlayerCount ?? 0) > 0 ? ` · ${settings.preliminaryDirectFinalPlayerCount} 人直通决赛` : ""}</small></div></li>
        <li className={`workflow-stage workflow-${stageSeal(stageStatus("semifinal"))}`}><b>2</b><div><strong>半决赛 <em className="stage-seal">{stageStatus("semifinal")}</em></strong><small>{settings.stages.semifinal.matchCountPerPlayer} 半庄/人{(settings.semifinalAdvancingPlayerCount ?? settings.stages.semifinal.advancingPlayerCount ?? 0) > 0 ? ` · ${settings.semifinalAdvancingPlayerCount ?? settings.stages.semifinal.advancingPlayerCount} 人晋级决赛` : ""}</small></div></li>
        <li className={`workflow-stage workflow-${stageSeal(stageStatus("final"))}`}><b>3</b><div><strong>决赛 <em className="stage-seal">{stageStatus("final")}</em></strong><small>{settings.stages.final.matchCountPerPlayer} 半庄/人</small></div></li>
      </ul>}
      {(competition.individualByes ?? []).length > 0 && <p className="field-note">轮空（本阶段少打一个半庄）：{["preliminary", "semifinal", "final"].flatMap((stage) => {
        const names = (competition.individualByes ?? []).filter((bye) => bye.stage === stage)
          .map((bye) => competition.participants.find((participant) => participant.id === bye.participantId)?.displayName ?? bye.participantId);
        return names.length ? [`${stageLabels[stage as "preliminary" | "semifinal" | "final"]} ${names.join("、")}`] : [];
      }).join("；")}</p>}
      <h3>待开赛</h3>
      {stageOrder.map((stage) => {
        const stageTables = plannedTables.filter((table) => table.stage === stage && table.status !== "cancelled");
        const pending = stageTables.filter((table) => table.status !== "completed" && !scheduledMatch(competition, table));
        if (stageTables.length && !pending.length) return null;
        return <section className="schedule-stage-group" key={stage}>
          <h4>{stageLabels[stage]} <em className={`stage-seal stage-seal-${stageSeal(stageStatus(stage))}`}>{stageStatus(stage)}</em></h4>
          {pending.length ? <div className="individual-schedule-grid">{pending.map((table) =>
            <article className="individual-schedule-card" key={table.id}>
              <header><strong>{dateFormatter.format(new Date(table.scheduledAt))}</strong><span>{stageLabels[stage]} · 第 {table.round} 轮 · A{table.tableNumber}</span></header>
              <div className="individual-schedule-players">{table.participantIds.map((id) => {
                const participant = competition.participants.find((item) => item.id === id);
                return <span style={{ "--player-color": participant?.color } as React.CSSProperties} key={id}>{participant?.displayName ?? id}</span>;
              })}</div>
              <footer>{admin ? <Link className="button primary" href={`/competitions/${competition.id}/matches/new?scheduleId=${encodeURIComponent(table.id)}`}>录入牌谱</Link> : <span>待开赛</span>}</footer>
            </article>
          )}</div> : <article className="individual-schedule-card schedule-pending-card"><header><strong>{stageLabels[stage]}</strong></header><div className="schedule-pending-label">待定中...</div></article>}
        </section>;
      })}
      {completed > 0 && <><h3>已完成</h3>{stageOrder.map((stage) => {
        const matches = competition.matches.filter((match) => match.status === "completed" && match.stage === stage)
          .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || b.matchNumber - a.matchNumber);
        return matches.length ? <section className="schedule-stage-group" key={stage}>
          <h4>{stageLabels[stage]} <em className={`stage-seal stage-seal-${stageSeal(stageStatus(stage))}`}>{stageStatus(stage)}</em></h4>
          <div className="individual-schedule-grid">{matches.map((match) => {
            const table = plannedTables.find((item) => scheduledMatch(competition, item)?.id === match.id);
            return <article className="individual-schedule-card schedule-completed" key={match.id}>
              <header><strong>{dateFormatter.format(new Date(table?.scheduledAt ?? match.playedAt))}</strong><span>{stageLabels[stage]} · 第 {match.round ?? 1} 轮 · A{match.tableNumber ?? "-"}</span></header>
              <div className="individual-schedule-players">{match.seats.map((seat) => {
                const participant = competition.participants.find((item) => item.id === seat.participantId);
                return <span style={{ "--player-color": participant?.color } as React.CSSProperties} key={seat.seat}>{participant?.displayName || seat.sourceUsername}</span>;
              })}</div>
              <footer><strong className="schedule-done">已录入牌谱</strong><Link className="table-edit-link" href={`/competitions/${competition.id}/matches/${match.matchNumber}`}><Pencil size={14} />查看</Link></footer>
            </article>;
          })}</div>
        </section> : null;
      })}</>}
      <Link className="button" href={`/competitions/${competition.id}/matches`}>查看牌谱记录</Link>
    </section>
  </div>;
}

export function IndividualCompetitionData({ competition, summary, round = 0 }: { competition: Competition; summary: CompetitionSummary; round?: number }) {
  const rateLabel = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`;
  const totals = individualCurrentPoints(competition, individualActiveStage(competition));
  const activeStage = individualActiveStage(competition);
  const rounds = individualStageRounds(competition, activeStage);
  const stageRows = (stage: "preliminary" | "semifinal" | "final") => round > 0 ? individualStageSnapshot(competition, stage, round) : individualStageStandings(competition, stage);
  const tiebreakRows = round > 0 ? individualStageSnapshot(competition, activeStage, round) : individualStageStandings(competition, activeStage);
  const sortedPlayers = [...competition.participants].sort((left, right) => {
    const leftTiebreak = { points: totals.get(left.id) ?? 0, averageRank: tiebreakRows.find((row) => row.participant.id === left.id)?.averageRank ?? null, firstPlaceCount: tiebreakRows.find((row) => row.participant.id === left.id)?.firstPlaceCount ?? 0, secondPlaceCount: tiebreakRows.find((row) => row.participant.id === left.id)?.secondPlaceCount ?? 0, displayName: left.displayName };
    const rightTiebreak = { points: totals.get(right.id) ?? 0, averageRank: tiebreakRows.find((row) => row.participant.id === right.id)?.averageRank ?? null, firstPlaceCount: tiebreakRows.find((row) => row.participant.id === right.id)?.firstPlaceCount ?? 0, secondPlaceCount: tiebreakRows.find((row) => row.participant.id === right.id)?.secondPlaceCount ?? 0, displayName: right.displayName };
    return compareIndividualTiebreak(leftTiebreak, rightTiebreak);
  });
  return <section className="section-block">
    <div className="section-heading"><div><h2>个人赛数据总览</h2><p className="section-note">同分排序：{individualTiebreakRule}</p></div><span className="table-count">{sortedPlayers.length} 人</span></div>
    {rounds.length > 1 && <div className="round-snapshot-bar">
      <span>积分榜快照</span>
      <Link className={round === 0 ? "active" : ""} href={`/competitions/${competition.id}/data`}>全部</Link>
      {rounds.map((value) => <Link className={round === value ? "active" : ""} key={value} href={`/competitions/${competition.id}/data?round=${value}`}>第 {value} 轮</Link>)}
      <em>{round > 0 ? `显示第 ${round} 轮结束时（含之前各轮）的积分` : "显示当前完整积分"}</em>
    </div>}
    <div className="table-wrap"><table className="match-table"><thead><tr><th>排名</th><th>选手</th><th>当前积分</th><th>半庄数</th><th>平均顺位</th><th>顺位分布</th><th>平均 Rating</th><th>和率</th><th>铳率</th><th>详细数据</th></tr></thead><tbody>{sortedPlayers.map((participant, index) => { const rankCounts = [1, 2, 3, 4].map((rank) => competition.matches.reduce((count, match) => count + (match.seats.find((seat) => seat.participantId === participant.id)?.rank === rank ? 1 : 0), 0)); const ratings = competition.matches.flatMap((match) => (match.nagaRatings ?? []).filter((rating) => match.seats.find((seat) => seat.participantId === participant.id)?.seat === Number(rating.participantId)).map((rating) => rating.rating)); const averageRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null; const total = totals.get(participant.id) ?? 0; return <tr key={participant.id}><td><strong>{index + 1}</strong></td><td><PlayerTag participant={participant} /></td><td className={total >= 0 ? "positive" : "negative"}>{total >= 0 ? "+" : ""}{total.toFixed(1)}</td><td>{summary[participant.id]?.["对局数"] ?? 0}</td><td>{summary[participant.id]?.["平均顺位"]?.toFixed(2) ?? "-"}</td><td>{rankCounts.join(" / ")}</td><td>{averageRating?.toFixed(1) ?? "-"}</td><td>{rateLabel(summary[participant.id]?.["和牌率"])}</td><td>{rateLabel(summary[participant.id]?.["放铳率"])}</td><td><Link className="table-edit-link" href={`/competitions/${competition.id}/data/${participant.id}`}>详细数据</Link></td></tr>; })}</tbody></table></div>
    {(["preliminary", "semifinal", "final"] as const).map((stage) => { const rows = stageRows(stage); if (!rows.length) return null; return <div className="table-wrap" key={stage}><h3>{stageLabels[stage]}积分榜{round > 0 ? `（第 ${round} 轮结束时）` : ""}</h3><table className="match-table"><thead><tr><th>排名</th><th>选手</th><th>积分</th><th>半庄数</th><th>平均顺位</th><th>一位/二位</th><th>晋级</th></tr></thead><tbody>{rows.map((row) => <tr key={row.participant.id}><td><strong>{row.rank}</strong></td><td><PlayerTag participant={row.participant} /></td><td>{row.points >= 0 ? "+" : ""}{row.points.toFixed(1)}</td><td>{row.games}</td><td>{row.averageRank?.toFixed(2) ?? "-"}</td><td>{row.firstPlaceCount} / {row.secondPlaceCount}</td><td>{row.advancing ? "晋级" : "-"}</td></tr>)}</tbody></table></div>; })}
  </section>;
}
