"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Save, Upload } from "lucide-react";
import type { Person } from "@/domain/types";
import { savePersonAction, type PersonFormState } from "@/app/players/actions";
import { PersonAvatar } from "@/components/person-avatar";
import { maxAvatarBytes } from "@/domain/avatar";
import { personIdError } from "@/domain/person-id";
import { DEFAULT_PERSON_TAG, personTags } from "@/domain/person-tags";
import { majsoulCelestialLevels, majsoulRanks } from "@/domain/majsoul-rank";
import type { PersonDraft } from "@/domain/person-draft";

const initialState: PersonFormState = { status: "idle", message: "" };

function accountText(person: Person | undefined, platform: "tenhou" | "majsoul" | "other") {
  return person?.accounts.filter((account) => account.platform === platform).map((account) => account.username).join(", ") || "";
}

export function PersonForm({ person, draft, availableTags }: { person?: Person; draft?: PersonDraft; availableTags: string[] }) {
  const [state, action, pending] = useActionState(savePersonAction, initialState);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  /**
   * 表单初值：编辑人物用现有档案；从信息收集创建时用自动填好的草稿（seed）。
   * person 仍然只用于判断「编辑 / 新建」和头像逻辑。
   */
  const seed: Person | undefined = person ?? (draft ? {
    id: draft.id,
    displayName: draft.displayName,
    kind: "human",
    color: draft.color,
    aliases: draft.aliases,
    accounts: draft.accounts,
    tags: draft.tags,
    ...(draft.majsoulRank ? { majsoulRank: draft.majsoulRank } : {}),
  } : undefined);
  const [majsoulRank, setMajsoulRank] = useState(seed?.majsoulRank || "");
  const [majsoulCelestialLevel, setMajsoulCelestialLevel] = useState(person?.majsoulCelestialLevel?.toString() || "");
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const displayedPerson = removeAvatar && person ? { ...person, avatarKey: undefined, avatarVersion: undefined, avatarContentType: undefined } : person;
  const selectedTags = new Set(state.selectedTags ?? (person ? personTags(person) : seed?.tags?.length ? seed.tags : availableTags.includes(DEFAULT_PERSON_TAG) ? [DEFAULT_PERSON_TAG] : []));
  return <form className="form-layout" action={action} onSubmit={(event) => { const form = event.currentTarget; const id = (form.elements.namedItem("id") as HTMLInputElement).value; const displayName = (form.elements.namedItem("displayName") as HTMLInputElement).value.trim(); if ((!person && personIdError(id)) || !displayName || avatarError) { event.preventDefault(); if (!displayName) { const input = form.elements.namedItem("displayName") as HTMLInputElement; input.setCustomValidity("请填写显示名称"); input.reportValidity(); input.addEventListener("input", () => input.setCustomValidity(""), { once: true }); } } }}>
    <input name="mode" type="hidden" value={person ? "edit" : "create"} />
    {person && <input name="originalId" type="hidden" value={person.id} />}
    {draft && !person && <section className="form-section draft-section">
      <div className="form-section-title"><span>✦</span><div><h2>已按信息收集自动填写</h2></div></div>
      <p className="field-note">识别到的字段：{draft.sources.length ? draft.sources.join("、") : "（无）"}。请核对后再保存。</p>
      {draft.notes.length > 0 && <ul className="draft-notes">{draft.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
    </section>}
    <section className="form-section"><div className="form-section-title"><span>1</span><div><h2>人物身份</h2></div></div><div className="field-grid">
      <label className="field"><span>人物 ID</span><div className="field-control-with-hint"><input name="id" defaultValue={value("id", seed?.id || "")} placeholder="例如：hmx 或 明轩" readOnly={Boolean(person)} required onChange={(event) => setIdError(personIdError(event.target.value))} aria-invalid={Boolean(idError)} />{!person && idError && <span className="field-validation error" role="status">{idError}</span>}{!person && !idError && <span className="field-validation valid" role="status">格式可用</span>}</div></label>
      <label className="field"><span>显示名称</span><input name="displayName" defaultValue={value("displayName", seed?.displayName || "")} required /></label>
      <label className="field"><span>人物类型</span><select name="kind" defaultValue={seed?.kind || "human"}><option value="human">人类</option><option value="ai">AI</option></select></label>
      <label className="field"><span>识别颜色</span><input className="color-input" name="color" type="color" defaultValue={seed?.color || "#168f83"} /></label>
      <div className="field wide"><span>人物标签</span>{availableTags.length ? <div className="choice-group">
        {availableTags.map((tag) => <label key={tag}><input name="tags" type="checkbox" value={tag} defaultChecked={selectedTags.has(tag)} /><span>{tag}</span></label>)}
      </div> : <p className="field-note">尚未创建可用标签，请先到标签管理中创建。</p>}</div>
      <label className="field wide"><span>历史昵称</span><textarea name="aliases" rows={3} defaultValue={value("aliases", seed?.aliases.join(", ") || "")} /></label>
      <label className="field wide"><span>共用账号优先归属</span><input name="sharedAccountPriority" defaultValue={value("sharedAccountPriority", (seed?.sharedAccountPriority ?? []).join(", "))} placeholder="昵称，逗号分隔；同一昵称挂在多人名下时优先算本人" /></label>
    </div></section>
    <section className="form-section"><div className="form-section-title"><span>2</span><div><h2>平台账号</h2></div></div><div className="field-grid">
      <label className="field wide"><span>天凤账号</span><input name="tenhouAccounts" defaultValue={value("tenhouAccounts", accountText(seed, "tenhou"))} /></label>
      <label className="field wide"><span>雀魂账号</span><input name="majsoulAccounts" defaultValue={value("majsoulAccounts", accountText(seed, "majsoul"))} /></label>
      <label className="field"><span>雀魂段位</span><select name="majsoulRank" value={majsoulRank} onChange={(event) => setMajsoulRank(event.target.value)}><option value="">未设置</option>{majsoulRanks.map((rank) => <option value={rank} key={rank}>{rank}</option>)}</select></label>
      {majsoulRank === "魂天" && <label className="field"><span>魂天等级</span><select name="majsoulCelestialLevel" value={majsoulCelestialLevel} onChange={(event) => setMajsoulCelestialLevel(event.target.value)} required><option value="" disabled>请选择</option>{majsoulCelestialLevels.map((level) => <option value={level} key={level}>Lv.{level}</option>)}</select></label>}
      <label className="field wide"><span>其他账号</span><input name="otherAccounts" defaultValue={value("otherAccounts", accountText(seed, "other"))} /></label>
    </div></section>
    <section className="form-section"><div className="form-section-title"><span>3</span><div><h2>人物头像</h2></div></div><div className="avatar-editor">
      {avatarPreview ? <div className="person-avatar person-avatar-large" style={{ "--player-color": seed?.color || "#168f83" } as React.CSSProperties}><img src={avatarPreview} alt="待上传头像预览" /></div> : <PersonAvatar person={displayedPerson || { id: "preview", displayName: seed?.displayName || "新人物", kind: "human", color: seed?.color || "#168f83", aliases: [], accounts: [] }} size="large" />}
      <div className="avatar-editor-actions">
        <label className="button avatar-upload-button"><Upload size={16} />选择头像<input className="avatar-file-input" name="avatar" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) { setAvatarError(null); return; }
          if (file.size > maxAvatarBytes) {
            event.currentTarget.value = "";
            setAvatarPreview(null);
            setAvatarError("头像不能超过 2 MB，请压缩或缩小图片后重试");
            return;
          }
          setAvatarError(null);
          setAvatarPreview(URL.createObjectURL(file));
          setRemoveAvatar(false);
        }} /></label>
        {person?.avatarKey && <label className="avatar-remove"><input name="removeAvatar" type="checkbox" checked={removeAvatar} onChange={(event) => setRemoveAvatar(event.target.checked)} />删除当前头像</label>}
        {avatarError && <p className="form-message" role="alert">{avatarError}</p>}
      </div>
    </div></section>
    {state.message && <p className="form-message" role="alert">{state.message}</p>}
    <div className="form-actions"><Link className="button" href={person ? `/players/${encodeURIComponent(person.id)}` : "/players"}>取消</Link><button className="button primary" type="submit" disabled={pending}><Save size={17} />{pending ? "正在保存" : "保存人物"}</button></div>
  </form>;
}
