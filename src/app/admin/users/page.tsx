import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { CreateAppUserForm, DeleteAppUserForm, ResetAppUserPasswordForm } from "@/components/app-user-forms";
import { requireAdminPage } from "@/server/auth";
import { listPeople } from "@/server/person-repository";
import { listAppUsers } from "@/server/user-repository";
import styles from "./users.module.css";

export const metadata: Metadata = { title: "账号管理 | XRC" };

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function AdminUsersPage() {
  await requireAdminPage("/admin/users");
  const [users, people] = await Promise.all([listAppUsers(), listPeople()]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const options = [...people]
    .filter((person) => person.kind === "human")
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN"))
    .map((person) => ({ id: person.id, displayName: person.displayName }));

  return <div className="page">
    <Link className="back-link" href="/players"><ArrowLeft size={16} />返回排行榜</Link>
    <div className="page-heading">
      <div>
        <p className="eyebrow">仅管理员可见</p>
        <h1>账号管理</h1>
        <p className={styles.subtitle}>选手账号用于散排录入：登录后只能录入包含自己（绑定人物）的牌谱。</p>
      </div>
    </div>
    <CreateAppUserForm people={options} />
    <section className="section-block">
      <div className="section-heading"><div><h2>已有账号</h2></div><span className="table-count">{users.length} 个</span></div>
      {users.length ? <div className="table-wrap">
        <table className="person-table">
          <thead><tr><th>账号</th><th>绑定人物</th><th>角色</th><th>创建时间</th><th>最后登录</th><th>操作</th></tr></thead>
          <tbody>{users.map((user) => {
            const person = user.personId ? peopleById.get(user.personId) : null;
            return <tr key={user.id}>
              <td><strong>{user.username}</strong>{user.displayName && <small>{user.displayName}</small>}</td>
              <td>{person ? <Link href={`/players/${encodeURIComponent(person.id)}`}>{person.displayName}</Link> : <span className={styles.unbound}>未绑定{user.personId ? `（${user.personId}）` : ""}</span>}</td>
              <td>{user.role === "admin" ? "管理员" : "选手"}</td>
              <td>{dateTime.format(new Date(user.createdAt))}</td>
              <td>{user.lastLoginAt ? dateTime.format(new Date(user.lastLoginAt)) : "-"}</td>
              <td><div className={styles.actions}><ResetAppUserPasswordForm userId={user.id} username={user.username} /><DeleteAppUserForm userId={user.id} username={user.username} /></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <div className={styles.empty}><KeyRound size={26} /><strong>还没有选手账号</strong><span>用上面的表单给选手创建账号，密码可以留空自动生成。</span></div>}
    </section>
  </div>;
}
