import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { isAdmin } from "@/server/auth";
import { currentPlayer } from "@/server/player-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "XRC 赛事管理",
  description: "立直麻将比赛、牌谱与数据管理",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [admin, player] = await Promise.all([isAdmin(), currentPlayer()]);
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body><AppShell admin={admin} player={admin || !player ? null : { username: player.username, displayName: player.displayName, personId: player.personId }}>{children}</AppShell></body>
    </html>
  );
}
