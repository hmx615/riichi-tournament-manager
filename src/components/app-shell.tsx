"use client";

import Link from "next/link";
import { BarChart3, CirclePlus, ClipboardList, LogIn, LogOut, Trophy, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";

const selectedCompetitionKey = "xrc-selected-competition";

function competitionIdFromPath(pathname: string) {
  const competitionId = pathname.match(/^\/competitions\/([^/]+)/)?.[1];
  return competitionId && competitionId !== "new" ? competitionId : null;
}

export function AppShell({ children, admin }: { children: ReactNode; admin: boolean }) {
  const pathname = usePathname();
  const [competitionId, setCompetitionId] = useState("1st-xrc");
  useEffect(() => {
    const fromPath = competitionIdFromPath(pathname);
    if (fromPath) {
      setCompetitionId(fromPath);
      window.localStorage.setItem(selectedCompetitionKey, fromPath);
      return;
    }
    const stored = window.localStorage.getItem(selectedCompetitionKey);
    if (stored && /^[a-z0-9-]+$/.test(stored)) setCompetitionId(stored);
  }, [pathname]);
  const scheduleHref = `/competitions/${competitionId}`;
  const dataHref = `${scheduleHref}/data`;
  const nav = [
    { href: "/", label: "比赛", icon: Trophy, active: pathname === "/" },
    { href: scheduleHref, label: "赛程", icon: ClipboardList, active: pathname.startsWith(scheduleHref) && !pathname.startsWith(dataHref) },
    { href: dataHref, label: "数据", icon: BarChart3, active: pathname.startsWith(dataHref) },
    { href: "/players", label: "人物", icon: Users, active: pathname.startsWith("/players") },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="赛事管理首页">
          <span className="brand-mark">X</span>
          <span><strong>XRC</strong><small>赛事管理</small></span>
        </Link>
        <nav aria-label="主导航">
          {nav.map(({ href, label, icon: Icon, active }) => (
            <Link className={active ? "active" : ""} href={href} key={label} aria-current={active ? "page" : undefined}><Icon size={18} />{label}</Link>
          ))}
        </nav>
        {admin && <Link className="new-competition" href="/competitions/new">
          <CirclePlus size={18} />新建比赛
        </Link>}
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div><strong>立直麻将赛事控制台</strong></div>
          <div className="auth-controls">
            <span className={`environment ${admin ? "admin-mode" : "viewer-mode"}`}>{admin ? "管理员模式" : "浏览模式"}</span>
            {admin ? <form action={logoutAction}><button className="topbar-action" type="submit"><LogOut size={15} />退出</button></form> : <Link className="topbar-action" href="/login"><LogIn size={15} />管理员登录</Link>}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
