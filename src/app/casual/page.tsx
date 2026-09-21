import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Inbox, ShieldAlert } from "lucide-react";
import { CasualEntryForm } from "@/components/casual-entry-form";
import { DeleteCasualRecordForm } from "@/components/delete-casual-record-form";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";
import { listPeople } from "@/server/person-repository";
import { listCasualRecords } from "@/server/casual-repository";
import { casualRecordHasNaga, type CasualRecord } from "@/domain/casual-record";
import styles from "./casual.module.css";

export const metadata: Metadata = { title: "散排录入 | XRC" };

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function CasualPage() {
  const [admin, player] = await Promise.all([isAdmin(), currentPlayer()]);
  if (!admin && !player) redirect(`/login?next=${encodeURIComponent("/casual")}`);
  const [people, records] = await Promise.all([listPeople(), listCasualRecords()]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const viewerPersonId = player?.personId ?? null;
  const peopleOptions = [...people]
    .filter((person) => person.kind === "human")
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN"))
    .map((person) => ({ id: person.id, displayName: person.displayName }));

  function seatLabel(record: CasualRecord, seat: CasualRecord["seats"][number], rank: number) {
    const person = seat.personId ? peopleById.get(seat.personId) : null;
    const isSelf = Boolean(seat.personId && seat.personId === viewerPersonId);
    return <span className={isSelf ? styles.selfSeat : undefined} key={`${record.id}-${seat.seat}`}>
      <b>{rank}位</b>
      {person ? <Link href={`/players/${encodeURIComponent(person.id)}`}>{person.displayName}</Link> : <span className={styles.guestSeat}>{seat.guestName || "排位对手"}</span>}
      <small>{seat.rawPoints.toLocaleString("zh-CN")}</small>
    </span>;
  }

  return <div className="page">
    <div className="page-heading">
      <div>
        <p className="eyebrow">自选牌谱</p>
        <h1>散排录入</h1>
      </div>
    </div>
    <section className={styles.notice}>
      <ShieldAlert size={18} />
      <div>
        <strong>散排数据与正式比赛完全分开</strong>
        <p>
          录入的牌谱只保存在散排池里，不会进入比赛统计、排行榜和推定段位。因为牌谱是大家自己挑的（赢的更容易被录），
          样本存在选择偏差，所以只在人物页的「散排数据」里单独展示。管理员可以录入任意牌谱，选手账号只能录入包含自己的牌谱。
        </p>
      </div>
    </section>
    {!admin && player && !player.personId && <section className={styles.notice}><ShieldAlert size={18} /><div><strong>当前账号还没有绑定人物</strong><p>请联系管理员在账号管理里把账号绑定到人物，之后才能录入散排牌谱。</p></div></section>}
    {(admin || player) && <section className="section-block">
      <div className="section-heading"><div><h2>录入散排牌谱</h2></div></div>
      <CasualEntryForm people={peopleOptions} selfPersonId={viewerPersonId} />
    </section>}
    <section className="section-block">
      <div className="section-heading"><div><h2>散排记录</h2></div><span className="table-count">{records.length} 场</span></div>
      {records.length ? <div className="table-wrap">
        <table className="person-table">
          <thead><tr><th>时间</th><th>四家（顺位 · 终局点数）</th><th>牌谱</th><th>录入人</th><th>操作</th></tr></thead>
          <tbody>{records.map((record) => {
            const owner = admin
              || record.createdByUsername === player?.username
              || Boolean(viewerPersonId && record.createdByPersonId === viewerPersonId);
            const ordered = [...record.seats].sort((left, right) => left.rank - right.rank);
            return <tr key={record.id}>
              <td>{dateTime.format(new Date(record.playedAt))}<small>{casualRecordHasNaga(record) ? "NAGA 已录入" : record.sourceType === "majsoul" ? "雀魂" : "天凤"}</small></td>
              <td><div className={styles.seatList}>{ordered.map((seat) => seatLabel(record, seat, seat.rank))}</div></td>
              <td><div className="source-links">
                {record.tenhouUrl && <a href={record.tenhouUrl} target="_blank" rel="noreferrer">天凤<ExternalLink size={13} /></a>}
                {record.nagaUrl && <a href={record.nagaUrl} target="_blank" rel="noreferrer">NAGA<ExternalLink size={13} /></a>}
                {!record.tenhouUrl && !record.nagaUrl && <span>-</span>}
              </div></td>
              <td>{record.createdByUsername || "管理员"}<small>{dateTime.format(new Date(record.createdAt))}</small></td>
              <td>{owner ? <DeleteCasualRecordForm recordId={record.id} label={ordered.map((seat) => seat.personId ? peopleById.get(seat.personId)?.displayName ?? seat.personId : seat.guestName).join("、")} /> : <span>-</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className={styles.empty}><Inbox size={28} /><strong>还没有散排记录</strong><span>录入第一份牌谱后会显示在这里。</span></div>}
    </section>
  </div>;
}
