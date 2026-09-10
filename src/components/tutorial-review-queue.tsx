"use client";

import { ArrowRight, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MahjongHand, MahjongTile } from "@/components/mahjong-tile";
import { TutorialHeader } from "@/components/tutorial-header";
import {
  initialTutorialCaseState,
  type TutorialCandidate,
  type TutorialCaseState,
} from "@/domain/tutorial-review";

type Stage = "initial" | "secondary" | "final" | "rejected";

const stageConfig = {
  initial: { title: "初筛", subtitle: "从全部一向听候选中挑出值得进一步讨论的牌例。", statuses: ["pending_initial"] },
  secondary: { title: "复筛", subtitle: "检查初筛通过的牌例，确认其教学价值和表达空间。", statuses: ["pending_secondary"] },
  final: { title: "最终牌例", subtitle: "复筛通过的牌例集中在这里，供教程制作时查看。", statuses: ["final"] },
  rejected: { title: "淘汰牌例", subtitle: "集中查看初筛与复筛淘汰的牌例，误选后可恢复到原筛选阶段。", statuses: ["rejected_initial", "rejected_secondary"] },
} as const;

function nagaUrl(item: TutorialCandidate) {
  return `https://ricochet.cn/api/naga/proxy/htmls/report_viewer.html?report_id=${encodeURIComponent(item.nagaReportId)}&tw=${item.actorSeat}`;
}

export function TutorialReviewQueue({
  stage,
  candidates,
  storedStates,
  reviewerName,
}: {
  stage: Stage;
  candidates: TutorialCandidate[];
  storedStates: TutorialCaseState[];
  reviewerName: string;
}) {
  const stateById = useMemo(() => new Map(storedStates.map((state) => [state.id, state])), [storedStates]);
  const stateFor = (id: string) => stateById.get(id) ?? initialTutorialCaseState(id);
  const counts = useMemo(() => ({
    initial: candidates.filter((candidate) => stateFor(candidate.id).status === "pending_initial").length,
    secondary: candidates.filter((candidate) => stateFor(candidate.id).status === "pending_secondary").length,
    final: candidates.filter((candidate) => stateFor(candidate.id).status === "final").length,
    rejected: candidates.filter((candidate) => stateFor(candidate.id).status.startsWith("rejected")).length,
  }), [candidates, stateById]);
  const [search, setSearch] = useState("");
  const [match, setMatch] = useState("");
  const [player, setPlayer] = useState("");
  const [tag, setTag] = useState("");
  const [transition, setTransition] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const config = stageConfig[stage];
  const matchOptions = useMemo(() => [...new Set(candidates.map((candidate) => candidate.matchNumber))].sort((a, b) => a - b), [candidates]);
  const playerOptions = useMemo(() => [...new Set(candidates.map((candidate) => candidate.playerName))].sort(), [candidates]);
  const tagOptions = useMemo(() => [...new Set(candidates.flatMap((candidate) => candidate.tags))].sort(), [candidates]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const state = stateFor(candidate.id);
      if (!(config.statuses as readonly string[]).includes(state.status)) return false;
      if (match && candidate.matchNumber !== Number(match)) return false;
      if (player && candidate.playerName !== player) return false;
      if (tag && !candidate.tags.includes(tag)) return false;
      if (transition && candidate.shantenTransition !== transition) return false;
      if (!query) return true;
      return [
        candidate.id,
        candidate.playerName,
        candidate.participant,
        candidate.roundLabel,
        candidate.tenhouLogId,
        candidate.hand.join(" "),
        candidate.actualDiscard,
        candidate.modelChoices.map((choice) => choice.discard).join(" "),
        candidate.tags.join(" "),
        state.note,
      ].join(" ").toLowerCase().includes(query);
    });
  }, [candidates, config.statuses, match, player, search, stateById, tag, transition]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const updateFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };

  return (
    <div className="tutorial-app">
      <TutorialHeader reviewerName={reviewerName} active={stage} counts={counts} />
      <main className="tutorial-queue-page">
        <div className="tutorial-page-heading">
          <div><p className="tutorial-eyebrow">第一期 · 一向听</p><h1>{config.title}</h1><p>{config.subtitle}</p></div>
          <strong>{filtered.length}<small>当前结果</small></strong>
        </div>
        <section className="tutorial-filters" aria-label="筛选条件">
          <label className="tutorial-search"><Search size={16} /><input value={search} onChange={(event) => updateFilter(setSearch, event.target.value)} placeholder="搜索编号、玩家、手牌或备注" /></label>
          <select aria-label="场次" value={match} onChange={(event) => updateFilter(setMatch, event.target.value)}><option value="">全部场次</option>{matchOptions.map((value) => <option value={value} key={value}>第 {value} 场</option>)}</select>
          <select aria-label="玩家" value={player} onChange={(event) => updateFilter(setPlayer, event.target.value)}><option value="">全部玩家</option>{playerOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select>
          <select aria-label="形状" value={tag} onChange={(event) => updateFilter(setTag, event.target.value)}><option value="">全部形状</option>{tagOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select>
          <select aria-label="向听变化" value={transition} onChange={(event) => updateFilter(setTransition, event.target.value)}><option value="">全部向听变化</option><option value="2-1">2→1（优先）</option><option value="1-1">1→1（有改良）</option></select>
        </section>

        <div className="tutorial-case-list">
          {visible.map((candidate, index) => {
            const state = stateFor(candidate.id);
            const lastEvent = state.history.at(-1);
            return (
              <article className={`tutorial-case-row${index === 0 || visible[index - 1].matchNumber !== candidate.matchNumber ? " match-start" : ""}`} key={candidate.id}>
                <div className="tutorial-case-location">
                  <span>{candidate.id}</span>
                  <strong>{candidate.roundLabel}</strong>
                  <small>{candidate.shantenTransition.replace("-", "→")} · {candidate.seatWind} · 第 {candidate.turnNumber} 巡 · {candidate.playerName}{stage === "rejected" ? ` · ${state.status === "rejected_initial" ? "初筛淘汰" : "复筛淘汰"}` : ""}</small>
                </div>
                <div className="tutorial-case-hand"><MahjongHand tiles={candidate.hand} drawnTile={candidate.drawnTile} compact /><div className="tutorial-dora-inline"><small>宝牌指示</small>{candidate.doraMarkers.map((tile, tileIndex) => <MahjongTile tile={tile} size="dora" key={`${tile}-${tileIndex}`} />)}</div></div>
                <div className="tutorial-case-decisions">
                  <span><small>实战</small><MahjongTile tile={candidate.actualDiscard} size="choice" /></span>
                  <span><small>NAGA</small>{[...new Set(candidate.modelChoices.map((choice) => choice.discard))].map((tile) => <MahjongTile tile={tile} size="choice" key={tile} />)}</span>
                </div>
                <div className="tutorial-case-meta">
                  <div>{candidate.tags.slice(0, 3).map((value) => <span key={value}>{value}</span>)}</div>
                  {lastEvent && <small>{lastEvent.reviewerName} · {new Date(lastEvent.createdAt).toLocaleString("zh-CN", { hour12: false })}</small>}
                  {state.note && <p>{state.note}</p>}
                </div>
                <div className="tutorial-case-links">
                  <a href={nagaUrl(candidate)} target="_blank" rel="noreferrer" title="打开 NAGA 报告"><ExternalLink size={16} /></a>
                  <a href={`/tutorials/one-shanten/cases/${candidate.id}?stage=${stage}`} title="打开牌桌" aria-label={`打开牌例 ${candidate.id}`}><ArrowRight size={20} /></a>
                </div>
              </article>
            );
          })}
          {!visible.length && <div className="tutorial-empty"><Search size={28} /><strong>没有符合条件的牌例</strong></div>}
        </div>
        <div className="tutorial-pagination">
          <span>{filtered.length ? `${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filtered.length)} / ${filtered.length}` : "0 条"}</span>
          <div><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage <= 1}>上一页</button><span>{safePage} / {pageCount}</span><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={safePage >= pageCount}>下一页</button></div>
        </div>
      </main>
    </div>
  );
}
