import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { isAdmin } from "@/server/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "XRC 赛事管理",
  description: "立直麻将比赛、牌谱与数据管理",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await isAdmin();
  return (
    <html lang="zh-CN">
      <body><AppShell admin={admin}>{children}</AppShell></body>
    </html>
  );
}
