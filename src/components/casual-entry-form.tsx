"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Link2, RefreshCw, Upload } from "lucide-react";
import { parseCasualAction, saveCasualAction, type CasualEntryState } from "@/app/casual/actions";
import styles from "@/app/casual/casual.module.css";

const winds = ["东", "南", "西", "北"];
const initialState: CasualEntryState = { status: "idle", message: "", preview: null };

type SeatDraft = { personId: string; guestName: string };

const emptySeats: SeatDraft[] = winds.map(() => ({ personId: "", guestName: "" }));

export function CasualEntryForm({ people, selfPersonId }: {
  people: Array<{ id: string; displayName: string }>;
  selfPersonId: string | null;
}) {
  const [sourceKind, setSourceKind] = useState<"link" | "majsoul_json">("link");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [majsoulJsonText, setMajsoulJsonText] = useState("");
  const [seats, setSeats] = useState<SeatDraft[]>(emptySeats);
  const [parseState, parseAction, parsing] = useActionState(parseCasualAction, initialState);
  const [saveState, saveAction, saving] = useActionState(saveCasualAction, initialState);
  const parsedPreview = parseState.preview;
  const previewMatchesSource = !sourceDirty && parsedPreview
    && (sourceKind === "majsoul_json" ? parsedPreview.sourceType === "majsoul" : parsedPreview.sourceType !== "majsoul");
  const preview = previewMatchesSource ? parsedPreview : null;
  const message = saveState.status !== "idle" && saveState.message ? saveState : parseState;

  useEffect(() => {
    if (!parsedPreview) return;
    // 解析成功后清掉「数据源已改动」标记，否则确认区会被判定为过期而隐藏。
    setSourceDirty(false);
    setSeats(parsedPreview.seats.map((seat) => {
      const personId = seat.participantId?.startsWith("person-") ? seat.participantId.slice("person-".length) : "";
      return { personId, guestName: seat.sourceUsername };
    }));
  }, [parsedPreview]);

  function updateSeat(index: number, patch: Partial<SeatDraft>) {
    setSeats((current) => current.map((seat, seatIndex) => (seatIndex === index ? { ...seat, ...patch } : seat)));
  }

  return (
    <form className="form-layout" action={parseAction}>
      <input name="sourceKind" type="hidden" value={sourceKind} />
      <input name="parsedLogId" type="hidden" value={parsedPreview?.sourceType === "majsoul" ? parsedPreview.logId : ""} />
      <section className="form-section">
        <div className="form-section-title"><span>1</span><div><h2>数据源</h2></div></div>
        <div className="source-type-switch" role="group" aria-label="牌谱数据源">
          <button className={sourceKind === "link" ? "active" : ""} type="button" onClick={() => { if (sourceKind !== "link") setSourceDirty(true); setSourceKind("link"); }}><Link2 size={16} />链接</button>
          <button className={sourceKind === "majsoul_json" ? "active" : ""} type="button" onClick={() => { if (sourceKind !== "majsoul_json") setSourceDirty(true); setSourceKind("majsoul_json"); }}><Upload size={16} />雀魂 JSON</button>
        </div>
        {sourceKind === "link" ? (
          <label className="field wide"><span>天凤或 NAGA 链接</span><div className="input-with-icon"><Link2 size={17} /><input name="sourceUrl" type="url" defaultValue={parsedPreview?.sourceUrl || ""} onChange={() => setSourceDirty(true)} placeholder="https://tenhou.net/3/?log=..." required /></div></label>
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
            <textarea name="majsoulJsonText" rows={8} value={majsoulJsonText} onChange={(event) => { setMajsoulJsonText(event.target.value); setSourceDirty(true); }} placeholder="粘贴 Ricochet 生成的完整 JSON" required={!preview} />
          </div>
        )}
        <button className="button parse-button" type="submit" disabled={parsing || saving}><RefreshCw className={parsing ? "spin" : ""} size={16} />{parsing ? "解析中" : "解析并检查"}</button>
        {message.message && <p className={`form-message ${message.status === "success" ? "success" : ""}`} role="status">{message.message}</p>}
      </section>
      <section className={`form-section${preview ? "" : " disabled-preview"}`}>
        <div className="form-section-title"><span>2</span><div><h2>确认四家身份</h2></div></div>
        <p className={styles.seatHint}>{selfPersonId
          ? "每家只需确认是你自己还是排位对手；对手沿用牌谱昵称，不会建立人物档案。"
          : "站内选手可直接选择；其他人保持为「排位对手」，不会建立人物档案。"}</p>
        <div className={`seat-editor${preview ? " active" : ""}`}>
          {winds.map((wind, index) => {
            const seat = preview?.seats[index];
            const draft = seats[index] ?? { personId: "", guestName: "" };
            return (
              <div key={`${preview?.logId || "empty"}-${wind}`} className={styles.seatRow}>
                <b>{wind}</b>
                <span className="source-name">{seat?.sourceUsername || "等待解析原始昵称"}{seat ? ` · ${seat.rawPoints.toLocaleString("zh-CN")}` : ""}{seat?.resolvedByTable && <em className="seat-match-note" title="该昵称被多人共用，按同桌去重自动确定">同桌去重</em>}{seat?.resolvedByPreference && <em className="seat-match-note preference" title="该昵称被多人共用，按偏好规则匹配，请核对">偏好匹配</em>}</span>
                <select name={`person${index}`} aria-label={`${wind}家选手`} value={draft.personId} disabled={!preview} onChange={(event) => updateSeat(index, { personId: event.target.value })}>
                  <option value="">排位对手</option>
                  {people.map((person) => <option value={person.id} key={person.id}>{person.displayName}{person.id === selfPersonId ? "（我）" : ""}</option>)}
                </select>
                {!draft.personId && <input name={`guest${index}`} type="hidden" value={draft.guestName} />}
                <span className={`match-state${draft.personId || draft.guestName ? " confirmed" : ""}`}>{seat ? `${seat.rank}位` : "未匹配"}</span>
              </div>
            );
          })}
        </div>
      </section>
      <div className="form-actions">
        <button className="button primary" type="submit" formAction={saveAction} disabled={!preview || parsing || saving || saveState.status === "success"}><CheckCircle2 size={17} />{saving ? "正在保存" : "确认录入散排"}</button>
      </div>
    </form>
  );
}
