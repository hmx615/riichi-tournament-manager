import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, Inbox } from "lucide-react";
import { requireAdminPage } from "@/server/auth";
import { listClubRegistrations } from "@/server/club-registration-repository";
import { DeleteRegistrationForm } from "@/components/delete-registration-form";
import styles from "../join.module.css";

export const metadata: Metadata = { title: "信息收集记录 | XRC" };

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function RegistrationResponsesPage() {
  await requireAdminPage("/join/responses");
  const registrations = await listClubRegistrations();
  return (
    <div className={styles.adminPage}>
      <div className={styles.adminHeading}>
        <div>
          <Link href="/join"><ArrowLeft size={15} />返回登记页</Link>
          <p className={styles.kicker}>仅管理员可见</p>
          <h1>信息收集记录</h1>
          <p>共 {registrations.length} 条提交</p>
        </div>
        <a className="button primary" href="/join/responses/export"><Download size={17} />导出 CSV</a>
      </div>
      {registrations.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>#</th><th>操作</th><th>提交时间</th><th>学号</th><th>网名</th><th>QQ</th><th>目前段位</th><th>其他平台最高段位</th><th>雀魂游戏昵称</th><th>雀魂ID</th><th>需求与方向</th></tr></thead>
            <tbody>{registrations.map((registration, index) => (
              <tr key={registration.id}>
                <td>{registrations.length - index}</td>
                <td><DeleteRegistrationForm id={registration.id} nickname={registration.nickname} /></td>
                <td>{dateTime.format(new Date(registration.createdAt))}</td>
                <td>{registration.studentId}</td>
                <td><strong>{registration.nickname}</strong></td>
                <td>{registration.qq}</td>
                <td>{registration.currentRank}</td>
                <td>{registration.otherPlatformRank || "—"}</td>
                <td>{registration.majsoulNickname || "—"}</td>
                <td>{registration.majsoulId}</td>
                <td>{registration.goals}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}><Inbox size={28} /><strong>还没有提交记录</strong><span>新提交会显示在这里。</span></div>
      )}
    </div>
  );
}
