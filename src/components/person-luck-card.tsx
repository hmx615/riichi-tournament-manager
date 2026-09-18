"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { luckLevelClass } from "@/components/luck-level";
import type { LuckDimension, LuckReport } from "@/domain/luck";
import styles from "./person-luck-card.module.css";

function formatValue(value: number, unit: string) {
  if (unit === "向听") return value.toFixed(2);
  return value.toLocaleString("zh-CN", { maximumFractionDigits: unit === "次" || unit === "胜" ? 1 : 0 });
}

function DimensionRow({ dimension }: { dimension: LuckDimension }) {
  const z = Math.max(-2, Math.min(2, dimension.z));
  const width = Math.abs(z) / 2 * 50;
  return (
    <div className={styles.row}>
      <span className={styles.label}>{dimension.label}</span>
      <span className={styles.value}>
        <strong className={z > 0.15 ? styles.positive : z < -0.15 ? styles.negative : undefined}>{formatValue(dimension.actual, dimension.unit)}</strong>
        <em>期望 {formatValue(dimension.expected, dimension.unit)}</em>
        <small>{dimension.unit}</small>
      </span>
      <span className={styles.sample}>{dimension.sampleCount.toLocaleString("zh-CN")} 样本</span>
      <span className={styles.bar} aria-hidden="true">
        <i className={z >= 0 ? styles.barPositive : styles.barNegative} style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}

export type LuckView = "recent" | "allTime";

export function PersonLuckCard({ report, recent, allTime, view, onChange }: {
  report: LuckReport;
  recent: LuckReport;
  allTime: LuckReport;
  view: LuckView;
  onChange: (view: LuckView) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className={`section-block ${styles.card}`}>
      <div className={styles.head}>
        <div>
          <h2>近期运势</h2>
          <p className={styles.window}>
            {view === "recent"
              ? `近 20 半庄（实际 ${recent.windowMatches} 半庄 · ${recent.windowRounds} 局）`
              : `全部牌谱（${allTime.windowMatches} 半庄 · ${allTime.windowRounds} 局）`}
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.switch} role="group" aria-label="运势统计范围">
            <button type="button" className={view === "recent" ? styles.switchOn : styles.switchOff} aria-pressed={view === "recent"} onClick={() => onChange("recent")}>
              近期 · 20 半庄
            </button>
            <button type="button" className={view === "allTime" ? styles.switchOn : styles.switchOff} aria-pressed={view === "allTime"} onClick={() => onChange("allTime")}>
              长期 · 全部牌谱
            </button>
          </div>
          <button type="button" className={styles.collapse} onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            {collapsed ? "展开明细" : "收起明细"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className={styles.rows}>
            {report.dimensions.map((dimension) => <DimensionRow key={dimension.key} dimension={dimension} />)}
          </div>
          <p className={styles.note}>
            只统计和技术无关的部分：发牌（起手向听、配牌宝牌/赤牌）、进程（摸牌宝牌、待牌被扣、里宝、一发）、对攻胜利。
            「对攻胜利」= 有人和牌的局里，先把当时所有听牌的人按待牌枚数算出各自的期望胜率，再看实际是谁和牌：显示的就是实际赢下的次数与期望次数。
            每项都跟期望值比较，样本少的维度会自动向"平平"收缩；不足 8 半庄时仅供参考。
          </p>
        </>
      )}
    </section>
  );
}
