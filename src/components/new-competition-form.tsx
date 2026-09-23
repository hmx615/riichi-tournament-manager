"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Check, Tags, UserPlus } from "lucide-react";
import type { Person } from "@/domain/types";
import { personTags } from "@/domain/person-tags";
import { createCompetitionAction, type CreateCompetitionState } from "@/app/competitions/actions";

const initialState: CreateCompetitionState = { message: "" };
const colors = ["#d1495b", "#168f83", "#6657c7", "#d58a18", "#4e8fc5", "#9c5f9c", "#4d9b73", "#b56a3b"];
type CreationType = "four_player" | "individual" | "match_pool";

export function NewCompetitionForm({ people, availableTags }: { people: Person[]; availableTags: string[] }) {
  const [state, action, pending] = useActionState(createCompetitionAction, initialState);
  const [creationType, setCreationType] = useState<CreationType>("four_player");
  const [participantCount, setParticipantCount] = useState(4);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [participantUsernames, setParticipantUsernames] = useState<Record<number, string>>({});
  const [participantNames, setParticipantNames] = useState<Record<number, string>>({});
  const individual = creationType === "individual";
  const matchPool = creationType === "match_pool";
  const eligibleCount = useMemo(() => people.filter((person) => personTags(person).some((tag) => selectedTags.includes(tag))).length, [people, selectedTags]);
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const error = (name: string) => state.fieldErrors?.[name]?.[0];
  return (
    <form className="form-layout" action={action} onSubmit={(event) => { const form = event.currentTarget; const code = (form.elements.namedItem("code") as HTMLInputElement).value.trim(); if (!/^[A-Za-z0-9-]+$/.test(code)) { event.preventDefault(); const input = form.elements.namedItem("code") as HTMLInputElement; input.setCustomValidity("比赛代号仅允许英文、数字和连字符"); input.reportValidity(); input.addEventListener("input", () => input.setCustomValidity(""), { once: true }); } }}>
      <section className="form-section">
        <div className="form-section-title"><span>1</span><div><h2>比赛设置</h2></div></div>
        <div className="field-grid">
          <label className="field wide"><span>比赛名称</span><input name="name" defaultValue={value("name")} placeholder={matchPool ? "例如：你瓜提高班" : "例如：2nd XRC 人机大战"} required />{error("name") && <small className="field-validation error">{error("name")}</small>}</label>
          <label className="field"><span>比赛代号</span><input name="code" defaultValue={value("code")} placeholder={matchPool ? "YOUGUA-TRAINING" : "2ND-XRC"} pattern="[A-Za-z0-9-]+" required />{error("code") && <small className="field-validation error">{error("code")}</small>}</label>
          <label className="field"><span>赛事类型</span><select name="creationType" value={creationType} onChange={(event) => { const next = event.target.value as CreationType; setCreationType(next); setParticipantCount(next === "individual" ? 8 : 4); }}><option value="four_player">四人对局赛</option><option value="individual">个人赛</option><option value="match_pool">匹配池</option></select></label>
          {!matchPool && <label className="field"><span>{individual ? "报名人数" : "参赛人数"}</span><input name="participantCount" type="number" min="4" max="200" value={participantCount} readOnly={!individual} onChange={(event) => setParticipantCount(Math.max(4, Math.min(200, Number(event.target.value) || 4)))} required />{error("participantCount") && <small className="field-validation error">{error("participantCount")}</small>}</label>}
          {matchPool && <input name="participantCount" type="hidden" value="0" />}
          {matchPool ? <div className="field"><span>赛制</span><p className="field-note">长期开放，按标签自动加入人物</p></div> : <label className="field"><span>{individual ? "总计划半庄数（显示用）" : "比赛半庄数"}</span><input name="plannedMatchCount" type="number" min="1" defaultValue="50" required /></label>}
          {matchPool && <input name="plannedMatchCount" type="hidden" value="100000" />}
          <label className="field"><span>原点</span><input name="initialPoints" type="number" step="100" defaultValue="25000" required /></label>
          <label className="field wide"><span>顺位马点</span><input name="rankPoints" defaultValue={value("rankPoints", "+30, +10, -10, -30")} required />{error("rankPoints") && <small className="field-validation error">{error("rankPoints")}</small>}</label>
          {individual && <>
            <label className="field"><span>初赛每人半庄数</span><input name="preliminaryMatches" type="number" min="0" defaultValue="4" required /></label>
            <label className="field"><span>半决赛每人半庄数</span><input name="semifinalMatches" type="number" min="0" defaultValue="0" required /></label>
            <label className="field"><span>决赛每人半庄数</span><input name="finalMatches" type="number" min="0" defaultValue="3" required /></label>
            <label className="field"><span>初赛晋级半决赛人数</span><input name="preliminaryAdvancing" type="number" min="0" defaultValue="0" required /></label>
            <label className="field"><span>初赛直通决赛人数</span><input name="preliminaryDirectFinal" type="number" min="0" defaultValue="0" required /></label>
            <label className="field"><span>半决赛晋级决赛人数</span><input name="semifinalAdvancing" type="number" min="0" defaultValue="0" required /></label>
          </>}
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-title"><span>2</span><div><h2>{matchPool ? "自动加入规则" : "参赛选手"}</h2>{matchPool && <p>命中任一所选标签的人物都会加入该匹配池。</p>}</div>{!matchPool && <Link className="button form-section-action" href="/players/new"><UserPlus size={15} />新建人物</Link>}</div>
        {matchPool ? <div className="field wide"><span>人物标签</span><div className="choice-group">
          {availableTags.map((tag) => <label key={tag}><input name="autoIncludePersonTags" type="checkbox" value={tag} checked={selectedTags.includes(tag)} onChange={(event) => setSelectedTags((current) => event.target.checked ? [...current, tag] : current.filter((item) => item !== tag))} /><span>{tag}</span></label>)}
          {!availableTags.length && <p className="field-note">请先到标签管理中创建人物标签。</p>}
        </div><p className="field-note pool-person-count"><Tags size={13} />当前将加入 {eligibleCount} 人</p></div> : <div className="participant-editor">
          {Array.from({ length: participantCount }, (_, index) => <div className="participant-form with-person" key={index}><b>{index + 1}</b><select name={`participantPersonId${index}`} aria-label={`选手${index + 1}人物身份`} defaultValue={value(`participantPersonId${index}`)} onChange={(event) => { const person = people.find((item) => item.id === event.target.value); const account = person?.accounts[0]?.username || ""; setParticipantNames((current) => ({ ...current, [index]: person?.displayName || "" })); setParticipantUsernames((current) => ({ ...current, [index]: account })); }} required><option value="" disabled>选择人物</option>{people.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select><input name={`participantName${index}`} aria-label={`选手${index + 1}显示名称`} value={participantNames[index] ?? value(`participantName${index}`)} onChange={(event) => setParticipantNames((current) => ({ ...current, [index]: event.target.value }))} placeholder="比赛显示名称（选择人物后自动填充）" required /><input name={`participantUsername${index}`} aria-label={`选手${index + 1}牌谱用户名`} value={participantUsernames[index] ?? value(`participantUsername${index}`)} onChange={(event) => setParticipantUsernames((current) => ({ ...current, [index]: event.target.value }))} placeholder="牌谱用户名（选择人物后自动填充）" required /><input name={`participantColor${index}`} aria-label={`选手${index + 1}颜色`} className="color-input" type="color" defaultValue={value(`participantColor${index}`, colors[index % colors.length])} /></div>)}
        </div>}
      </section>
      {state.message && <p className="form-message" role="alert">{state.message}{state.fieldErrors && Object.values(state.fieldErrors).flat().length > 0 && `（${Object.values(state.fieldErrors).flat().join("；")}）`}</p>}
      <div className="form-actions"><Link className="button" href="/">取消</Link><button className="button primary" type="submit" disabled={pending}><Check size={17} />{pending ? "正在创建" : matchPool ? "创建匹配池" : "创建并进入赛程"}</button></div>
    </form>
  );
}
