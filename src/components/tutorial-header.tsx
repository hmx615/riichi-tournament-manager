"use client";

import { BookOpenCheck, LogOut } from "lucide-react";

export function TutorialHeader({
  reviewerName,
  active,
  counts,
}: {
  reviewerName: string;
  active?: "initial" | "secondary" | "final" | "rejected";
  counts?: { initial: number; secondary: number; final: number; rejected: number };
}) {
  async function logout() {
    await fetch("/tutorial-api/logout", { method: "POST" });
    window.location.assign("/tutorials/login");
  }
  const links = [
    { id: "initial" as const, href: "/tutorials/one-shanten/initial", label: "初筛", count: counts?.initial },
    { id: "secondary" as const, href: "/tutorials/one-shanten/secondary", label: "复筛", count: counts?.secondary },
    { id: "final" as const, href: "/tutorials/one-shanten/final", label: "最终牌例", count: counts?.final },
    { id: "rejected" as const, href: "/tutorials/one-shanten/rejected", label: "淘汰牌例", count: counts?.rejected },
  ];
  return (
    <header className="tutorial-header">
      <a className="tutorial-brand" href="/tutorials/one-shanten/initial">
        <BookOpenCheck size={20} /><span><strong>轩轩的牌例筛选站</strong></span>
      </a>
      <nav aria-label="牌例筛选阶段">
        {links.map((link) => (
          <a className={active === link.id ? "active" : ""} href={link.href} key={link.id}>
            {link.label}{typeof link.count === "number" && <span>{link.count}</span>}
          </a>
        ))}
      </nav>
      <div className="tutorial-account">
        <span><small>当前账号</small><strong>{reviewerName}</strong></span>
        <button type="button" onClick={logout} title="退出登录" aria-label="退出登录"><LogOut size={17} /></button>
      </div>
    </header>
  );
}
