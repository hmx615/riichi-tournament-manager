import Link from "next/link";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { requireAdminPage } from "@/server/auth";
import { getCompetition } from "@/server/competition-repository";
import { currentOpenNegotiationDay, negotiationDayGroups, sessionCards, sessionLabel } from "@/domain/negotiation-overview";
import { individualSettingsFor } from "@/domain/competition-format";
import { individualNegotiationOpen, individualNegotiationOpensAt } from "@/domain/individual-tournament";
import { PlayerTag } from "@/components/player-tag";
import type { Competition } from "@/domain/types";
import styles from "./negotiation.module.css";

const dayFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
const beijing = (iso: string | number) => timeFormatter.format(new Date(iso));

export default async function NegotiationOverviewPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  await requireAdminPage(`/competitions/${competitionId}/negotiation`);
  const competition = await getCompetition(competitionId);
  if (!competition) return null;

  const settings = individualSettingsFor(competition);
  const days = negotiationDayGroups(competition);
  const isOpen = (table: NonNullable<Competition["individualSchedule"]>[number]) => !settings || individualNegotiationOpen(table, settings);
  // 只盯当前开放的那一天；这轮回完就会自动落到下一轮，不用管理员手动切。
  const liveDay = currentOpenNegotiationDay(days, isOpen);
  const liveCards = liveDay ? sessionCards(competition, liveDay) : [];
  const nameOf = (participantId: string) => competition.participants.find((item) => item.id === participantId)?.displayName ?? participantId;


  // 默认展开最近一个「已开放但还有人没确认」的日子；没有就展开第一天。
  const focusDay = days.find((day) => !day.complete && day.tables.some((item) => !settings || individualNegotiationOpen(item.table, settings)))?.day
    ?? days.find((day) => !day.complete)?.day
    ?? days[0]?.day;

  return <div className="page form-page">
    <Link className="back-link" href={`/competitions/${competition.id}`}><ArrowLeft size={16} />返回比赛</Link>
    <div className="page-heading">
      <div><p className="eyebrow">{competition.code} · 管理员视角</p><h1>协商进度总览</h1></div>
      <div className="heading-actions">
        <Link className="button" href={`/negotiation?competition=${encodeURIComponent(competition.id)}`}>代选手进入协商</Link>
      </div>
    </div>

    <section className={styles.now} aria-label="当前开放的场次">
      <div className={styles.nowHead}>
        <strong><CircleAlert size={15} />当前要盯的场次</strong>
        <span>{liveDay
          ? `${dayFormatter.format(new Date(liveDay.startsAt))} · ${liveDay.rounds.join(" / ")} 轮`
          : "眼下没有开放协商的场次"}</span>
      </div>
      {liveCards.length === 0 && <p className="field-note">这一轮都回完了，或还没到开放时间；下面的按天列表可以翻看后续场次。</p>}
      <div className={styles.nowCards}>
        {liveCards.map((card) => <div className={styles.nowCard} key={card.round}>
          <header><strong>{card.label}</strong><span>{beijing(card.time)}</span>
            <em>{card.confirmed}/{card.total} 已确认</em>
            {card.adminCount > 0 && <i className={styles.nowFlag}>需要介入 {card.adminCount}</i>}
          </header>
          <ul>
            {card.entries.map((item) => {
              const participant = competition.participants.find((entry) => entry.id === item.participantId);
              const state = item.needsAdmin ? "admin" : item.status === "accepted" ? "done" : item.status === "declined" ? "admin" : "wait";
              return <li key={item.participantId} className={styles[state]}>
                {participant && <PlayerTag participant={participant} compact />}
                <em>{item.needsAdmin ? (item.status === "declined" ? "不能来" : "协商中") : item.status === "accepted" ? "已确认" : "待确认"}</em>
              </li>;
            })}
          </ul>
        </div>)}
      </div>
    </section>

    <section className="form-section">
      <div className="form-section-title"><span>1</span><div><h2>按天查看</h2></div></div>
      {days.length === 0 && <p className="field-note">还没有排好的赛程。</p>}
      {days.map((day) => {
        const open = settings ? day.tables.some((item) => individualNegotiationOpen(item.table, settings)) : true;
        const opensAt = settings ? day.tables.map((item) => individualNegotiationOpensAt(item.table, settings)).filter(Boolean)[0] : null;
        const percent = day.total ? Math.round((day.responded / day.total) * 100) : 0;
        return <details className={`${styles.day} ${day.complete ? styles.dayDone : ""}`} key={day.day} open={day.day === focusDay}>
          <summary>
            <strong>{dayFormatter.format(new Date(day.startsAt))}</strong>
            <span className={styles.dayRounds}>第 {day.rounds.join(" / ")} 轮 · {beijing(day.startsAt)} 起</span>
            <span className={styles.dayBar}><i style={{ width: `${percent}%` }} /></span>
            <span className={styles.dayCount}>{day.responded}/{day.total}</span>
            <span className={`${styles.dayState} ${day.complete ? styles.stateDone : open ? styles.stateOpen : styles.stateLocked}`}>
              {day.complete ? "已确认" : open ? (day.waiting.length ? `${day.waiting.length} 人待回"` : "进行中") : "未开放"}
            </span>
          </summary>
          <div className={styles.dayBody}>
            {!open && opensAt && <p className="field-note">本场时间协商将于 {dayFormatter.format(new Date(opensAt))} {beijing(opensAt)} 开启。</p>}
            {day.waitingByRound.some((item) => item.participantIds.length > 0) && <div className={styles.waitingLine}>还差：{day.waitingByRound.filter((item) => item.participantIds.length).map((item) => <span key={item.round}><b>{sessionLabel(item.time)}</b> {item.participantIds.map(nameOf).join("、")}</span>)}</div>}
            {day.declined.length > 0 && <p className={styles.declinedLine}>表示不能来：{day.declined.map(nameOf).join("、")}</p>}
            {day.tables.map((summary) => <div className={styles.table} key={summary.table.id}>
              <div className={styles.tableHead}>
                <strong>第 {summary.table.round} 轮 · A{summary.table.tableNumber}</strong>
                <span>{beijing(summary.table.scheduledAt)}</span>
                <span className={`${styles.tableState} ${summary.allConfirmed ? styles.stateDone : ""}`}>
                  {summary.allConfirmed ? "全员确认" : `已确认 ${summary.responded}/${summary.total}`}
                </span>
                <Link className="table-edit-link" href={`/competitions/${competition.id}/schedule?week=${summary.table.week ?? 1}#${summary.table.id}`}>赛程</Link>
              </div>
              <ul className={styles.players}>
                {summary.responses.map((item) => {
                  const participant = competition.participants.find((entry) => entry.id === item.participantId);
                  return <li key={item.participantId} className={styles[item.status]}>
                    {participant && <PlayerTag participant={participant} compact />}
                    <em>{item.status === "accepted" ? "已确认" : item.status === "declined" ? "不能来" : "待确认"}</em>
                  </li>;
                })}
              </ul>
            </div>)}
          </div>
        </details>;
      })}
    </section>
  </div>;
}
