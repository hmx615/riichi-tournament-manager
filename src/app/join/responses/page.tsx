import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, Inbox, UserPlus } from "lucide-react";
import { requireAdminPage } from "@/server/auth";
import { listClubRegistrations } from "@/server/club-registration-repository";
import { listPeople } from "@/server/person-repository";
import { findPersonForDraft, personDraftFromRecord } from "@/domain/person-draft";
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
  const [registrations, people] = await Promise.all([listClubRegistrations(), listPeople()]);
  // 每条记录都试算一份人物草稿：已建过人物就给出链接，否则一键带着自动填写的内容去建人物。
  const rows = registrations.map((registration) => {
    const draft = personDraftFromRecord(registration as unknown as Record<string, unknown>, { people, defaultTags: ["你瓜提高班"] });
    return { registration, draft, person: findPersonForDraft(draft, people) };
  });
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
            <thead><tr><th>#</th><th>操作</th><th>人物</th><th>提交时间</th><th>学号</th><th>网名</th><th>QQ</th><th>目前段位</th><th>其他平台最高段位</th><th>雀魂游戏昵称</th><th>雀魂ID</th><th>需求与方向</th></tr></thead>
            <tbody>{rows.map(({ registration, person }, index) => (
              <tr key={registration.id}>
                <td>{registrations.length - index}</td>
                <td><DeleteRegistrationForm id={registration.id} nickname={registration.nickname} /></td>
                <td>{person
                  ? <Link className={styles.personLink} href={`/players/${encodeURIComponent(person.id)}`}>已建：{person.displayName}</Link>
                  : <Link className="button" href={`/players/new?registration=${encodeURIComponent(registration.id)}&tag=${encodeURIComponent("你瓜提高班")}`}><UserPlus size={14} />创建人物</Link>}</td>
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
