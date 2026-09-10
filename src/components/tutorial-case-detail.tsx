"use client";

import { ArrowLeft, ArrowRight, Check, ExternalLink, Palette, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MahjongBack, MahjongHand, MahjongMelds, MahjongTile } from "@/components/mahjong-tile";
import { TutorialHeader } from "@/components/tutorial-header";
import type {
  TutorialCandidate,
  TutorialCaseState,
  TutorialReviewAction,
  TutorialReviewerId,
} from "@/domain/tutorial-review";
import { initialPassReviewerId } from "@/domain/tutorial-review";

const seatWinds = ["东", "南", "西", "北"];
type TablePosition = "bottom" | "right" | "top" | "left";
type TableBackgroundSkin = "miku" | "luotianyi" | "felt";
type TileBackSkin = "diamond" | "star" | "lattice" | "solid";
type TileBackColor = { r: number; g: number; b: number };
const backgroundSkinKey = "tutorial-table-background";
const tileBackSkinKey = "tutorial-tile-back";
const tileBackColorKey = "tutorial-tile-back-color";
const defaultTileBackColor: TileBackColor = { r: 2, g: 8, b: 11 };

function tileBackCssColor(color: TileBackColor) {
  return `rgb(${color.r * 17} ${color.g * 17} ${color.b * 17})`;
}

function validTileBackColor(value: unknown): value is TileBackColor {
  if (!value || typeof value !== "object") return false;
  return ["r", "g", "b"].every((channel) => {
    const level = (value as Record<string, unknown>)[channel];
    return Number.isInteger(level) && Number(level) >= 1 && Number(level) <= 15;
  });
}
const actionLabels: Record<TutorialReviewAction, string> = {
  initial_pass: "初筛通过",
  initial_reject: "初筛淘汰",
  secondary_pass: "复筛通过",
  secondary_reject: "复筛淘汰",
  return_initial: "退回初筛",
  restore_initial: "恢复到初筛",
  restore_secondary: "恢复到复筛",
  return_secondary: "移出最终牌例",
};
const statusLabels = {
  pending_initial: "待初筛",
  pending_secondary: "待复筛",
  final: "最终牌例",
  rejected_initial: "初筛淘汰",
  rejected_secondary: "复筛淘汰",
};

function availableActions(status: TutorialCaseState["status"]) {
  if (status === "pending_initial") return ["initial_pass", "initial_reject"] as const;
  if (status === "pending_secondary") return ["secondary_pass", "secondary_reject", "return_initial"] as const;
  if (status === "rejected_initial") return ["restore_initial"] as const;
  if (status === "rejected_secondary") return ["restore_secondary"] as const;
  return ["return_secondary"] as const;
}

function actionClass(action: TutorialReviewAction) {
  if (action.endsWith("pass")) return "approve";
  if (action.endsWith("reject")) return "reject";
  return "restore";
}

function ActionIcon({ action }: { action: TutorialReviewAction }) {
  if (action.endsWith("pass")) return <Check size={17} />;
  if (action.endsWith("reject")) return <X size={17} />;
  return <RotateCcw size={16} />;
}

function PlayerLabel({
  candidate,
  seat,
  position,
}: {
  candidate: TutorialCandidate;
  seat: number;
  position: TablePosition;
}) {
  const wind = seatWinds[(seat - candidate.board.dealerSeat + 4) % 4];
  return (
    <div className={`table-player table-player-${position}${seat === candidate.actorSeat ? " current" : ""}`}>
      <span>{wind}</span><strong>{candidate.board.playerNames[seat]}</strong>
    </div>
  );
}

function probabilityLabel(probability: number) {
  const percentage = probability * 100;
  return `${percentage >= 10 ? Math.round(percentage) : percentage.toFixed(1)}%`;
}

function OpponentHand({
  candidate,
  seat,
  position,
}: {
  candidate: TutorialCandidate;
  seat: number;
  position: "top" | "left" | "right";
}) {
  return (
    <div className={`opponent-hand opponent-hand-${position}`}>
      <div className="opponent-concealed">
        {Array.from({ length: candidate.board.concealedTileCounts[seat] }, (_, index) => <MahjongBack compact key={index} />)}
      </div>
    </div>
  );
}

function TableMelds({ candidate, seat, position }: { candidate: TutorialCandidate; seat: number; position: TablePosition }) {
  const melds = candidate.board.melds[seat];
  if (melds.length === 0) return null;
  return (
    <div className={`table-melds table-melds-${position}`} aria-label={`${candidate.board.playerNames[seat]}的副露`}>
      <MahjongMelds melds={melds} />
    </div>
  );
}

function River({ candidate, seat, position }: { candidate: TutorialCandidate; seat: number; position: string }) {
  const river = candidate.board.rivers[seat];
  const rows = Array.from({ length: Math.ceil(river.length / 6) }, (_, rowIndex) => river.slice(rowIndex * 6, rowIndex * 6 + 6));
  return (
    <div className={`table-river table-river-${position}`} aria-label={`${candidate.board.playerNames[seat]}的牌河`}>
      {rows.map((row, rowIndex) => (
        <div className="table-river-row" key={rowIndex}>
          {row.map((entry, columnIndex) => (
            <span className={`${entry.called ? "called " : ""}${entry.riichi ? "riichi" : ""}`.trim()} key={`${entry.tile}-${rowIndex * 6 + columnIndex}`}>
              <MahjongTile tile={entry.tile} size="river" sideways={entry.riichi} muted={entry.called} dimmed={entry.tsumogiri} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function MahjongTable({
  candidate,
  backgroundSkin,
  tileBackSkin,
  tileBackColor,
}: {
  candidate: TutorialCandidate;
  backgroundSkin: TableBackgroundSkin;
  tileBackSkin: TileBackSkin;
  tileBackColor: TileBackColor;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resizeTable = () => {
      const element = scrollRef.current;
      if (!element) return;
      setScale(window.innerWidth <= 600 ? Math.min(1, element.clientWidth / 960) : 1);
    };
    resizeTable();
    const observer = new ResizeObserver(resizeTable);
    if (scrollRef.current) observer.observe(scrollRef.current);
    window.addEventListener("resize", resizeTable);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeTable);
    };
  }, []);
  const seats = {
    bottom: candidate.actorSeat,
    right: (candidate.actorSeat + 1) % 4,
    top: (candidate.actorSeat + 2) % 4,
    left: (candidate.actorSeat + 3) % 4,
  };
  const tableStyle = {
    ...(scale < 1 ? { transform: `scale(${scale})` } : {}),
    "--tile-back-color": tileBackCssColor(tileBackColor),
  } as CSSProperties;
  return (
    <div
      className={`mahjong-table-scroll${scale < 1 ? " scaled" : ""}`}
      ref={scrollRef}
      style={scale < 1 ? { height: `${600 * scale}px` } : undefined}
    >
      <div className={`mahjong-table table-background-${backgroundSkin} tile-back-${tileBackSkin}`} style={tableStyle}>
        <div className="table-vignette" />
        <OpponentHand candidate={candidate} seat={seats.top} position="top" />
        <OpponentHand candidate={candidate} seat={seats.left} position="left" />
        <OpponentHand candidate={candidate} seat={seats.right} position="right" />
        {Object.entries(seats).map(([position, seat]) => <PlayerLabel candidate={candidate} seat={seat} position={position as keyof typeof seats} key={position} />)}
        {Object.entries(seats).map(([position, seat]) => <TableMelds candidate={candidate} seat={seat} position={position as TablePosition} key={`melds-${position}`} />)}
        {Object.entries(seats).map(([position, seat]) => <River candidate={candidate} seat={seat} position={position} key={position} />)}
        <div className="table-center">
          {Object.entries(seats).map(([position, seat]) => (
            <div className={`table-center-seat table-center-seat-${position}`} key={`score-${position}`}>
              <span className="table-center-scoreline">
                <b>{seatWinds[(seat - candidate.board.dealerSeat + 4) % 4]}</b>
                <span className={`table-center-score${seat === candidate.actorSeat ? " current" : ""}`}>{candidate.board.scores[seat]}</span>
              </span>
              {candidate.board.riichiSeats[seat] && <i className="table-riichi-stick" aria-label="立直棒" />}
            </div>
          ))}
          <div className="table-center-main">
            <strong>{candidate.roundLabel}</strong>
            <div className={`table-center-dora${candidate.doraMarkers.length >= 3 ? " compact" : ""}`} aria-label="宝牌指示牌从左到右：初始、第一杠、第二杠、第三杠、第四杠">
              {candidate.doraMarkers.length < 3 && <span>宝牌指示</span>}
              <i className={`table-dora-sequence${candidate.doraMarkers.length > 1 ? " ordered" : ""}`}>
                {candidate.doraMarkers.map((tile, index) => <MahjongTile tile={tile} size="dora" key={`${tile}-${index}`} />)}
              </i>
            </div>
            <p>余 {candidate.board.leftTileCount} 枚</p>
            <small>{candidate.board.kyotaku} 供托 · {candidate.board.honba} 本场</small>
          </div>
        </div>
        <div className="table-own-hand"><MahjongHand tiles={candidate.hand} drawnTile={candidate.drawnTile} /></div>
      </div>
    </div>
  );
}

function SkinPicker({
  backgroundSkin,
  tileBackSkin,
  tileBackColor,
  onBackgroundChange,
  onTileBackChange,
  onTileBackColorChange,
}: {
  backgroundSkin: TableBackgroundSkin;
  tileBackSkin: TileBackSkin;
  tileBackColor: TileBackColor;
  onBackgroundChange: (skin: TableBackgroundSkin) => void;
  onTileBackChange: (skin: TileBackSkin) => void;
  onTileBackColorChange: (channel: keyof TileBackColor, value: number) => void;
}) {
  const previewStyle = { "--tile-back-color": tileBackCssColor(tileBackColor) } as CSSProperties;
  return (
    <details className="tutorial-skin-picker">
      <summary><Palette size={16} />牌桌皮肤</summary>
      <div className="tutorial-skin-popover">
        <section>
          <span>背景</span>
          <div className="tutorial-skin-options">
            <button type="button" aria-pressed={backgroundSkin === "miku"} onClick={() => onBackgroundChange("miku")}>
              <i className="skin-preview skin-preview-miku" />初音{backgroundSkin === "miku" && <Check size={13} />}
            </button>
            <button type="button" aria-pressed={backgroundSkin === "luotianyi"} onClick={() => onBackgroundChange("luotianyi")}>
              <i className="skin-preview skin-preview-luotianyi" />洛天依{backgroundSkin === "luotianyi" && <Check size={13} />}
            </button>
            <button type="button" aria-pressed={backgroundSkin === "felt"} onClick={() => onBackgroundChange("felt")}>
              <i className="skin-preview skin-preview-felt" />绿毡{backgroundSkin === "felt" && <Check size={13} />}
            </button>
          </div>
        </section>
        <section>
          <span>牌背</span>
          <div className="tutorial-skin-options">
            <button type="button" aria-pressed={tileBackSkin === "diamond"} onClick={() => onTileBackChange("diamond")}>
              <i className="skin-back-preview skin-back-preview-diamond" style={previewStyle} />菱纹{tileBackSkin === "diamond" && <Check size={13} />}
            </button>
            <button type="button" aria-pressed={tileBackSkin === "star"} onClick={() => onTileBackChange("star")}>
              <i className="skin-back-preview skin-back-preview-star" style={previewStyle} />星纹{tileBackSkin === "star" && <Check size={13} />}
            </button>
            <button type="button" aria-pressed={tileBackSkin === "lattice"} onClick={() => onTileBackChange("lattice")}>
              <i className="skin-back-preview skin-back-preview-lattice" style={previewStyle} />格纹{tileBackSkin === "lattice" && <Check size={13} />}
            </button>
            <button type="button" aria-pressed={tileBackSkin === "solid"} onClick={() => onTileBackChange("solid")}>
              <i className="skin-back-preview skin-back-preview-solid" style={previewStyle} />纯色{tileBackSkin === "solid" && <Check size={13} />}
            </button>
          </div>
        </section>
        <section className="tutorial-color-controls">
          <span>牌背颜色</span>
          <i className="tutorial-color-swatch" style={{ background: tileBackCssColor(tileBackColor) }} />
          {(["r", "g", "b"] as const).map((channel) => (
            <label className={`color-channel color-channel-${channel}`} key={channel}>
              <span>{channel.toUpperCase()}</span>
              <input type="range" min="1" max="15" step="1" value={tileBackColor[channel]} onChange={(event) => onTileBackColorChange(channel, Number(event.target.value))} />
              <output>{tileBackColor[channel]}</output>
            </label>
          ))}
        </section>
      </div>
    </details>
  );
}

function nagaUrl(item: TutorialCandidate) {
  return `https://ricochet.cn/api/naga/proxy/htmls/report_viewer.html?report_id=${encodeURIComponent(item.nagaReportId)}&tw=${item.actorSeat}`;
}

export function TutorialCaseDetail({
  candidate,
  initialState,
  reviewerId,
  reviewerName,
  reviewStage,
  counts,
  previousCaseId,
  nextCaseId,
  visualTestMode,
  onNavigate,
  onReviewSaved,
}: {
  candidate: TutorialCandidate;
  initialState: TutorialCaseState;
  reviewerId: TutorialReviewerId;
  reviewerName: string;
  reviewStage: "initial" | "secondary" | "final" | "rejected";
  counts: { initial: number; secondary: number; final: number; rejected: number };
  previousCaseId: string | null;
  nextCaseId: string | null;
  visualTestMode?: "riichi" | "kan" | "kan4";
  onNavigate?: (href: string) => void;
  onReviewSaved?: (state: TutorialCaseState) => void;
}) {
  const state = initialState;
  const [note, setNote] = useState(initialState.note);
  const [pendingAction, setPendingAction] = useState<TutorialReviewAction | null>(null);
  const [message, setMessage] = useState("");
  const [backgroundSkin, setBackgroundSkin] = useState<TableBackgroundSkin>("miku");
  const [tileBackSkin, setTileBackSkin] = useState<TileBackSkin>("diamond");
  const [tileBackColor, setTileBackColor] = useState<TileBackColor>(defaultTileBackColor);
  const stage = reviewStage;
  const secondaryReviewerBlocked = state.status === "pending_secondary"
    && initialPassReviewerId(state) === reviewerId;

  useEffect(() => {
    setNote(initialState.note);
    setPendingAction(null);
    setMessage("");
  }, [candidate.id, initialState.note]);

  useEffect(() => {
    const storedBackground = window.localStorage.getItem(backgroundSkinKey);
    const storedTileBack = window.localStorage.getItem(tileBackSkinKey);
    const storedColor = window.localStorage.getItem(tileBackColorKey);
    if (storedBackground === "miku" || storedBackground === "luotianyi" || storedBackground === "felt") setBackgroundSkin(storedBackground);
    if (storedTileBack === "diamond" || storedTileBack === "star" || storedTileBack === "lattice" || storedTileBack === "solid") setTileBackSkin(storedTileBack);
    if (storedTileBack === "pattern") setTileBackSkin("diamond");
    if (storedTileBack === "wave") setTileBackSkin("star");
    if (storedColor) {
      try {
        const parsedColor: unknown = JSON.parse(storedColor);
        if (validTileBackColor(parsedColor)) setTileBackColor(parsedColor);
      } catch {
        window.localStorage.removeItem(tileBackColorKey);
      }
    }
  }, []);

  function chooseBackgroundSkin(skin: TableBackgroundSkin) {
    setBackgroundSkin(skin);
    window.localStorage.setItem(backgroundSkinKey, skin);
  }

  function chooseTileBackSkin(skin: TileBackSkin) {
    setTileBackSkin(skin);
    window.localStorage.setItem(tileBackSkinKey, skin);
  }

  function chooseTileBackColor(channel: keyof TileBackColor, value: number) {
    const nextColor = { ...tileBackColor, [channel]: value };
    setTileBackColor(nextColor);
    window.localStorage.setItem(tileBackColorKey, JSON.stringify(nextColor));
  }

  async function submit(action: TutorialReviewAction) {
    let navigationStarted = false;
    setPendingAction(action);
    setMessage("");
    try {
      const response = await fetch(`/api/tutorial-reviews/${encodeURIComponent(candidate.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note, expectedVersion: state.version }),
      });
      const responseText = await response.text();
      let result: { state?: TutorialCaseState; error?: string } = {};
      try {
        result = JSON.parse(responseText) as { state?: TutorialCaseState; error?: string };
      } catch {
        if (response.status >= 500) throw new Error("服务器暂时繁忙，正在确认筛选状态，请稍后刷新");
        throw new Error("服务器返回了无效响应，请刷新后重试");
      }
      if (response.status === 401) {
        window.location.assign(`/tutorials/login?next=${encodeURIComponent(`/tutorials/one-shanten/cases/${candidate.id}`)}`);
        return;
      }
      if (response.status === 409) {
        window.location.reload();
        return;
      }
      if (!response.ok || !result.state) throw new Error(result.error || "保存失败");
      onReviewSaved?.(result.state);
      const nextPath = nextCaseId
        ? `/tutorials/one-shanten/cases/${nextCaseId}?stage=${stage}`
        : `/tutorials/one-shanten/${stage}`;
      navigationStarted = true;
      if (onNavigate) onNavigate(nextPath);
      else window.location.assign(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      if (!navigationStarted) setPendingAction(null);
    }
  }

  return (
    <div className="tutorial-app tutorial-detail-app">
      <TutorialHeader reviewerName={reviewerName} active={stage} counts={counts} />
      <main className="tutorial-detail-page">
        <div className="tutorial-detail-toolbar">
          <a href={`/tutorials/one-shanten/${stage}`}><ArrowLeft size={16} />返回{stage === "initial" ? "初筛" : stage === "secondary" ? "复筛" : stage === "final" ? "最终牌例" : "淘汰牌例"}</a>
          <div>
            <SkinPicker
              backgroundSkin={backgroundSkin}
              tileBackSkin={tileBackSkin}
              tileBackColor={tileBackColor}
              onBackgroundChange={chooseBackgroundSkin}
              onTileBackChange={chooseTileBackSkin}
              onTileBackColorChange={chooseTileBackColor}
            />
            {previousCaseId ? <a href={`/tutorials/one-shanten/cases/${previousCaseId}?stage=${stage}`} title="上一条"><ArrowLeft size={17} />上一条</a> : <span />}
            {nextCaseId ? <a href={`/tutorials/one-shanten/cases/${nextCaseId}?stage=${stage}`} title="下一条">下一条<ArrowRight size={17} /></a> : <span />}
          </div>
        </div>
        <div className="tutorial-detail-layout">
          <section className="tutorial-table-panel">
            <div className="tutorial-case-title">
              <div><span>{candidate.id}</span><h1>{candidate.roundLabel} · {candidate.seatWind} · 第 {candidate.turnNumber} 巡</h1></div>
              <span className={`tutorial-status ${visualTestMode ? "status-test" : `status-${state.status}`}`}>{visualTestMode === "riichi" ? "立直显示测试" : visualTestMode === "kan" ? "杠牌显示测试" : visualTestMode === "kan4" ? "四杠显示测试" : statusLabels[state.status]}</span>
            </div>
            <MahjongTable candidate={candidate} backgroundSkin={backgroundSkin} tileBackSkin={tileBackSkin} tileBackColor={tileBackColor} />
          </section>
          <aside className="tutorial-decision-panel">
            <section>
              <p className="tutorial-eyebrow">决策对照</p>
              <div className="decision-actual"><span>实战切牌</span><MahjongTile tile={candidate.actualDiscard} size="choice" /><small>{candidate.actualRelation}</small></div>
              <div className="decision-models">
                {candidate.modelChoices.map((choice) => {
                  const recommendations = choice.recommendations?.length ? choice.recommendations : [choice];
                  return (
                    <div className="decision-model" key={choice.model}>
                      <span>{choice.model}</span>
                      <div className="decision-recommendations">
                        {recommendations.map((recommendation, index) => (
                          <div className="decision-recommendation" key={`${recommendation.discard}-${index}`}>
                            <i>{index + 1}</i>
                            <MahjongTile tile={recommendation.discard} size="choice" />
                            <p>{probabilityLabel(recommendation.probability)}<small>{recommendation.effectiveTileCount} 枚进张 · {recommendation.effectiveTileTypes} 种</small></p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="tutorial-tags">{candidate.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <div className="tutorial-metrics"><span>向听变化<strong>{candidate.shantenTransition.replace("-", "→")}</strong></span><span>{candidate.shantenTransition === "1-1" ? "进张增加" : "有效切牌"}<strong>{candidate.shantenTransition === "1-1" ? `+${candidate.ukeireImprovement}` : candidate.efficientDiscardCount}</strong></span><span>教学评分<strong>{candidate.lessonScore}</strong></span><span>切法进张差<strong>{candidate.ukeireSpread}</strong></span></div>
            </section>
            {!visualTestMode && <section className="tutorial-review-box">
              <label><span>筛选备注</span><textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="可选，记录入选理由或需要讨论的问题" /></label>
              <div className="tutorial-review-actions">
                {availableActions(state.status).map((action) => (
                  <button
                    className={actionClass(action)}
                    type="button"
                    disabled={pendingAction !== null || (secondaryReviewerBlocked && (action === "secondary_pass" || action === "secondary_reject"))}
                    onClick={() => submit(action)}
                    key={action}
                  >
                    <ActionIcon action={action} />{pendingAction === action ? "正在保存" : actionLabels[action]}
                  </button>
                ))}
              </div>
              {secondaryReviewerBlocked && <p className="reviewer-blocked">该牌例由你初筛通过，需要另一位管理员完成复筛。</p>}
              {message && <p className={message.endsWith("已保存") ? "success" : "error"}>{message}</p>}
            </section>}
            <section className="tutorial-history">
              <div><strong>操作记录</strong><a href={nagaUrl(candidate)} target="_blank" rel="noreferrer">NAGA <ExternalLink size={13} /></a></div>
              {state.history.length ? [...state.history].reverse().slice(0, 5).map((event) => (
                <p key={event.id}><span>{event.reviewerName} · {actionLabels[event.action]}</span><small>{new Date(event.createdAt).toLocaleString("zh-CN", { hour12: false })}</small>{event.note && <em>{event.note}</em>}</p>
              )) : <p className="empty">尚未筛选</p>}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
