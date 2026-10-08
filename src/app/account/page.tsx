import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { currentPlayer } from "@/server/player-auth";
import { requirePlayerPage } from "@/server/player-auth";
import { getPerson } from "@/server/person-repository";
import { AccountForm } from "@/components/account-form";
import styles from "./account.module.css";

export default async function AccountPage({ searchParams }: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requirePlayerPage("/account");
  const query = await searchParams;
  const player = await currentPlayer();
  if (!player) return null;
  const person = player.personId ? await getPerson(player.personId) : null;
  return <div className="page form-page">
    <Link className="back-link" href="/casual"><ArrowLeft size={16} />返回散排</Link>
    <div className="page-heading">
      <div><p className="eyebrow">我的账号</p><h1>个人资料</h1></div>
    </div>
    {query?.saved === "1" && <p className="form-message success" role="status">资料已保存。</p>}
    {query?.error && <p className="form-error" role="alert">{query.error}</p>}

    <AccountForm
      username={player.username}
      displayName={player.displayName}
      personDisplayName={person?.displayName ?? player.displayName}
      personId={person?.id ?? null}
      avatarUrl={person?.avatarKey ? `/api/avatars/${encodeURIComponent(person.id)}?v=${person.avatarVersion ?? 0}` : null}
      hasAvatar={Boolean(person?.avatarKey)}
    />

    <section className={styles.readonly}>
      <h2><ShieldAlert size={16} />不能自己改的部分</h2>
      <p>绑定的人物、参赛名单、比赛成绩和密码都不在这里改：</p>
      <ul>
        <li><span>人物 ID</span><code>{person?.id ?? player.personId ?? "未绑定"}</code></li>
        <li><span>密码</span><em>忘记密码请联系赛事管理员重置</em></li>
        <li><span>删除账号</span><em>不支持自助删除，需要请联系管理员</em></li>
      </ul>
      <p className="field-note">改了「人物显示名」会同步到排行榜和你在本网站的展示名；比赛里的参赛名单和已录入成绩不变。</p>
    </section>
  </div>;
}
