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

const initialState: PersonFormState = { status: "idle", message: "" };

function accountText(person: Person | undefined, platform: "tenhou" | "majsoul" | "other") {
  return person?.accounts.filter((account) => account.platform === platform).map((account) => account.username).join(", ") || "";
}

export function PersonForm({ person, availableTags }: { person?: Person; availableTags: string[] }) {
  const [state, action, pending] = useActionState(savePersonAction, initialState);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [majsoulRank, setMajsoulRank] = useState(person?.majsoulRank || "");
  const [majsoulCelestialLevel, setMajsoulCelestialLevel] = useState(person?.majsoulCelestialLevel?.toString() || "");
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const displayedPerson = removeAvatar && person ? { ...person, avatarKey: undefined, avatarVersion: undefined, avatarContentType: undefined } : person;
  const selectedTags = new Set(state.selectedTags ?? (person ? personTags(person) : availableTags.includes(DEFAULT_PERSON_TAG) ? [DEFAULT_PERSON_TAG] : []));
  return <form className="form-layout" action={action} onSubmit={(event) => { const form = event.currentTarget; const id = (form.elements.namedItem("id") as HTMLInputElement).value; const displayName = (form.elements.namedItem("displayName") as HTMLInputElement).value.trim(); if ((!person && personIdError(id)) || !displayName || avatarError) { event.preventDefault(); if (!displayName) { const input = form.elements.namedItem("displayName") as HTMLInputElement; input.setCustomValidity("请填写显示名称"); input.reportValidity(); input.addEventListener("input", () => input.setCustomValidity(""), { once: true }); } } }}>
    <input name="mode" type="hidden" value={person ? "edit" : "create"} />
    {person && <input name="originalId" type="hidden" value={person.id} />}
    <section className="form-section"><div className="form-section-title"><span>1</span><div><h2>人物身份</h2></div></div><div className="field-grid">
      <label className="field"><span>人物 ID</span><div className="field-control-with-hint"><input name="id" defaultValue={value("id", person?.id || "")} placeholder="例如：hmx 或 明轩" readOnly={Boolean(person)} required onChange={(event) => setIdError(personIdError(event.target.value))} aria-invalid={Boolean(idError)} />{!person && idError && <span className="field-validation error" role="status">{idError}</span>}{!person && !idError && <span className="field-validation valid" role="status">格式可用</span>}</div></label>
      <label className="field"><span>显示名称</span><input name="displayName" defaultValue={value("displayName", person?.displayName || "")} required /></label>
      <label className="field"><span>人物类型</span><select name="kind" defaultValue={person?.kind || "human"}><option value="human">人类</option><option value="ai">AI</option></select></label>
      <label className="field"><span>识别颜色</span><input className="color-input" name="color" type="color" defaultValue={person?.color || "#168f83"} /></label>
      <div className="field wide"><span>人物标签</span>{availableTags.length ? <div className="choice-group">
        {availableTags.map((tag) => <label key={tag}><input name="tags" type="checkbox" value={tag} defaultChecked={selectedTags.has(tag)} /><span>{tag}</span></label>)}
      </div> : <p className="field-note">尚未创建可用标签，请先到标签管理中创建。</p>}</div>
      <label className="field wide"><span>历史昵称</span><textarea name="aliases" rows={3} defaultValue={value("aliases", person?.aliases.join(", ") || "")} /></label>
    </div></section>
    <section className="form-section"><div className="form-section-title"><span>2</span><div><h2>平台账号</h2></div></div><div className="field-grid">
      <label className="field wide"><span>天凤账号</span><input name="tenhouAccounts" defaultValue={value("tenhouAccounts", accountText(person, "tenhou"))} /></label>
      <label className="field wide"><span>雀魂账号</span><input name="majsoulAccounts" defaultValue={value("majsoulAccounts", accountText(person, "majsoul"))} /></label>
      <label className="field"><span>雀魂段位</span><select name="majsoulRank" value={majsoulRank} onChange={(event) => setMajsoulRank(event.target.value)}><option value="">未设置</option>{majsoulRanks.map((rank) => <option value={rank} key={rank}>{rank}</option>)}</select></label>
      {majsoulRank === "魂天" && <label className="field"><span>魂天等级</span><select name="majsoulCelestialLevel" value={majsoulCelestialLevel} onChange={(event) => setMajsoulCelestialLevel(event.target.value)} required><option value="" disabled>请选择</option>{majsoulCelestialLevels.map((level) => <option value={level} key={level}>Lv.{level}</option>)}</select></label>}
      <label className="field wide"><span>其他账号</span><input name="otherAccounts" defaultValue={value("otherAccounts", accountText(person, "other"))} /></label>
    </div></section>
    <section className="form-section"><div className="form-section-title"><span>3</span><div><h2>人物头像</h2></div></div><div className="avatar-editor">
      {avatarPreview ? <div className="person-avatar person-avatar-large" style={{ "--player-color": person?.color || "#168f83" } as React.CSSProperties}><img src={avatarPreview} alt="待上传头像预览" /></div> : <PersonAvatar person={displayedPerson || { id: "preview", displayName: "新人物", kind: "human", color: "#168f83", aliases: [], accounts: [] }} size="large" />}
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
