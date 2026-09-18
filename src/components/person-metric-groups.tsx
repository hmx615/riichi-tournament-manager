"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GitCompareArrows, Search, X } from "lucide-react";
import { METRIC_GROUPS, formatMetricDelta, formatMetricValue, metricTone } from "@/domain/metric-compare";
import styles from "./person-data-overview.module.css";

export type ComparePerson = {
  id: string;
  displayName: string;
  color: string;
  matchCount: number;
};

export type MetricSummary = Record<string, number | null>;

export function PersonMetricGroups({
  person,
  summary,
  people,
  summaries,
  initialCompareId,
}: {
  person: { id: string; displayName: string; color: string; matchCount: number };
  summary: MetricSummary;
  people: ComparePerson[];
  summaries: Record<string, MetricSummary>;
  initialCompareId: string | null;
}) {
  const [compareId, setCompareId] = useState(initialCompareId);
  const opponent = compareId ? people.find((item) => item.id === compareId) ?? null : null;
  const opponentSummary = opponent ? summaries[opponent.id] ?? {} : null;

  function applyCompare(nextId: string | null) {
    setCompareId(nextId);
    // 只改 URL、不重新请求页面：对比数据已经在客户端，切换是瞬时的。
    const url = new URL(window.location.href);
    if (nextId) url.searchParams.set("compare", nextId);
    else url.searchParams.delete("compare");
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="person-metric-groups">
      {METRIC_GROUPS.map((group) => (
        <section className="data-group" key={group.title}>
          <div className={styles.groupHead}>
            <div className={styles.groupTitles}>
              <h2>{group.title}</h2>
              {opponent && (
                <span className={styles.compareNames}>
                  <i style={{ background: person.color }} />
                  {person.displayName} {person.matchCount}半庄
                  <em>vs</em>
                  <i style={{ background: opponent.color }} />
                  {opponent.displayName} {opponent.matchCount}半庄
                </span>
              )}
            </div>
            <CompareControl
              people={people}
              currentPersonId={person.id}
              compareId={compareId}
              onSelect={applyCompare}
            />
          </div>
          <div className={`person-metric-list${opponent ? ` ${styles.compareList}` : ""}`}>
            {group.metrics.map(([field, type]) => {
              const mine = summary[field];
              const theirs = opponentSummary ? opponentSummary[field] : null;
              if (!opponentSummary) {
                return <div key={field}><span>{field}</span><strong>{formatMetricValue(mine, type)}</strong></div>;
              }
              const tone = metricTone(field, mine, theirs);
              const delta = formatMetricDelta(type, mine, theirs);
              const hint = [
                `${person.displayName} ${formatMetricValue(mine, type)}`,
                `${opponent?.displayName} ${formatMetricValue(theirs, type)}`,
                delta ? `差 ${delta}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <div key={field} title={hint}>
                  <span>{field}</span>
                  <strong className={tone === "better" ? styles.better : tone === "worse" ? styles.worse : undefined}>{formatMetricValue(mine, type)}</strong>
                  <strong className={tone === "better" ? styles.worse : tone === "worse" ? styles.better : undefined}>{formatMetricValue(theirs, type)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function CompareControl({
  people,
  currentPersonId,
  compareId,
  onSelect,
}: {
  people: ComparePerson[];
  currentPersonId: string;
  compareId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const candidates = useMemo(() => {
    const search = keyword.trim().toLocaleLowerCase();
    return people.filter((item) => item.id !== currentPersonId
      && (!search || item.displayName.toLocaleLowerCase().includes(search) || item.id.toLocaleLowerCase().includes(search)));
  }, [people, keyword, currentPersonId]);

  function choose(id: string | null) {
    onSelect(id);
    setOpen(false);
    setKeyword("");
  }

  return (
    <div className={styles.compareControl} ref={containerRef}>
      <button
        type="button"
        className={styles.compareButton}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <GitCompareArrows size={13} />
        {compareId ? "更换对手" : "对比其他玩家"}
      </button>
      {compareId && (
        <button type="button" className={styles.compareClear} onClick={() => choose(null)} title="取消对比" aria-label="取消对比">
          <X size={12} />
        </button>
      )}
      {open && (
        <div className={styles.comparePanel} role="dialog" aria-label="选择对比玩家">
          <label className={styles.compareSearch}>
            <Search size={12} />
            <input
              autoFocus
              value={keyword}
              placeholder="搜索选手"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <div className={styles.compareOptions}>
            {candidates.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === compareId ? styles.compareOptionActive : styles.compareOption}
                onClick={() => choose(item.id)}
              >
                <i style={{ background: item.color }} />
                {item.displayName}
                <small>{item.matchCount} 半庄</small>
              </button>
            ))}
            {candidates.length === 0 && <p className={styles.compareEmpty}>没有匹配的选手</p>}
          </div>
        </div>
      )}
    </div>
  );
}
