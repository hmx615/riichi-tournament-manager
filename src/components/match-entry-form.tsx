"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Link2, RefreshCw, Upload } from "lucide-react";
import type { Competition } from "@/domain/types";
import { parseMatchAction, saveMatchAction, type MatchEntryState } from "@/app/competitions/1st-xrc/matches/actions";

const winds = ["东", "南", "西", "北"];
const initialState: MatchEntryState = { status: "idle", message: "", preview: null, operation: null, targetMatchNumber: null };

export function MatchEntryForm({ competition }: { competition: Competition }) {
  const [sourceKind, setSourceKind] = useState<"link" | "majsoul_json">("link");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [majsoulJsonText, setMajsoulJsonText] = useState("");
  const [parseState, parseAction, parsing] = useActionState(parseMatchAction, initialState);
  const [saveState, saveAction, saving] = useActionState(saveMatchAction, initialState);
  const parsedPreview = parseState.preview;
  useEffect(() => {
    if (parsedPreview) setSourceDirty(false);
  }, [parseState, parsedPreview]);
  const previewMatchesSource = !sourceDirty && parsedPreview && (sourceKind === "majsoul_json" ? parsedPreview.sourceType === "majsoul" : parsedPreview.sourceType !== "majsoul");
  const preview = previewMatchesSource ? parsedPreview : null;
  const supplementing = parseState.operation === "supplement_naga";
  const targetMatch = supplementing ? competition.matches.find((match) => match.matchNumber === parseState.targetMatchNumber) : null;
  const message = saveState.status === "error" ? saveState : parseState;

  return (
    <form className="form-layout" action={parseAction}>
      <input name="competitionId" type="hidden" value={competition.id} />
      <input name="sourceKind" type="hidden" value={sourceKind} />
      <input name="parsedLogId" type="hidden" value={preview?.sourceType === "majsoul" ? preview.logId : ""} />
      <section className="form-section">
        <div className="form-section-title"><span>1</span><div><h2>数据源</h2></div></div>
        <div className="source-type-switch" role="group" aria-label="牌谱数据源">
          <button className={sourceKind === "link" ? "active" : ""} type="button" onClick={() => { if (sourceKind !== "link") setSourceDirty(true); setSourceKind("link"); }}><Link2 size={16} />链接</button>
          <button className={sourceKind === "majsoul_json" ? "active" : ""} type="button" onClick={() => { if (sourceKind !== "majsoul_json") setSourceDirty(true); setSourceKind("majsoul_json"); }}><Upload size={16} />雀魂 JSON</button>
        </div>
        {sourceKind === "link" ? (
          <label className="field wide"><span>天凤或 NAGA 链接</span><div className="input-with-icon"><Link2 size={17} /><input name="sourceUrl" type="url" defaultValue={preview?.sourceUrl || ""} onChange={() => setSourceDirty(true)} placeholder="https://tenhou.net/3/?log=..." required /></div></label>
        ) : (
          <div className="field wide">
            <div className="json-input-heading">
              <span>Ricochet 雀魂 JSON</span>
              <label className="button json-file-button"><Upload size={15} />上传 JSON 文件<input className="json-file-input" type="file" accept=".json,application/json" onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                setMajsoulJsonText(await file.text());
                setSourceDirty(true);
              }} /></label>
            </div>
            <textarea name="majsoulJsonText" rows={10} value={majsoulJsonText} onChange={(event) => { setMajsoulJsonText(event.target.value); setSourceDirty(true); }} placeholder="粘贴 Ricochet 生成的完整 JSON" required={!preview} />
          </div>
        )}
        <button className="button parse-button" type="submit" disabled={parsing || saving}><RefreshCw className={parsing ? "spin" : ""} size={16} />{parsing ? "解析中" : "解析并检查"}</button>
        {message.message && <p className={`form-message ${message.status === "success" ? "success" : ""}`} role="status">{message.message}</p>}
      </section>
      <section className={`form-section${preview ? "" : " disabled-preview"}`}>
        <div className="form-section-title"><span>2</span><div><h2>{supplementing ? "确认补充内容" : "确认身份与座次"}</h2></div></div>
        <div className={`seat-editor${preview ? " active" : ""}`}>
          {winds.map((wind, index) => {
            const seat = preview?.seats[index];
            const participantId = supplementing
              ? targetMatch?.seats.find((item) => item.seat === index)?.participantId || ""
              : seat?.participantId || "";
            return (
              <div key={`${preview?.logId || "empty"}-${wind}`}>
                <b>{wind}</b>
                <span className="source-name">{seat?.sourceUsername || "等待解析原始昵称"}{seat ? ` · ${seat.rawPoints.toLocaleString("zh-CN")}` : ""}</span>
                <select name={`participant${index}`} aria-label={`${wind}家选手`} defaultValue={participantId} disabled={!preview || supplementing} required={!supplementing}>
                  <option value="" disabled>选择赛事选手</option>
                  {competition.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}</option>)}
                </select>
                <span className={`match-state${participantId ? " confirmed" : ""}`}>{seat ? `${seat.rank}位 · ${seat.competitionPoints >= 0 ? "+" : ""}${seat.competitionPoints.toFixed(1)}` : "未匹配"}</span>
              </div>
            );
          })}
        </div>
      </section>
      <div className="form-actions"><Link className="button" href={`/competitions/${competition.id}`}>取消</Link><button className="button primary" type="submit" formAction={saveAction} disabled={!preview || parsing || saving}><CheckCircle2 size={17} />{saving ? "正在保存" : supplementing ? "确认补充 NAGA" : "确认录入并计算"}</button></div>
    </form>
  );
}
