import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { ClubRegistrationForm } from "@/components/club-registration-form";
import { isAdmin } from "@/server/auth";
import styles from "./join.module.css";

export const metadata: Metadata = {
  title: "在校生信息登记 | XRC",
  description: "立直麻将社群在校生信息登记",
};

export default async function JoinPage() {
  const admin = await isAdmin();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>在校生登记</p>
          <h1>加入瓜大雀力日进群</h1>
          <p>填写基本资料与训练需求，用于学生身份核验、赛事组织和资源对接。</p>
        </div>
        <div className={styles.tileStrip} aria-hidden="true">
          <img src="/mahjong-tiles/Man1.svg" alt="" />
          <img src="/mahjong-tiles/Pin1.svg" alt="" />
          <img src="/mahjong-tiles/Sou1.svg" alt="" />
          <img src="/mahjong-tiles/Haku.svg" alt="" />
        </div>
        {admin && <Link className="button" href="/join/responses"><ClipboardList size={17} />查看已收集信息</Link>}
      </header>
      <ClubRegistrationForm />
    </div>
  );
}
