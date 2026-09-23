import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  createPerson: vi.fn(),
  getPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
  putAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  newAvatarKey: vi.fn(),
  detectAvatarContentType: vi.fn(),
  listPersonTags: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/domain/avatar", () => ({ maxAvatarBytes: 2 * 1024 * 1024, detectAvatarContentType: mocks.detectAvatarContentType }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/server/person-repository", () => ({ createPerson: mocks.createPerson, getPerson: mocks.getPerson, updatePerson: mocks.updatePerson, deletePerson: mocks.deletePerson }));
vi.mock("@/server/avatar-storage", () => ({ putAvatar: mocks.putAvatar, deleteAvatar: mocks.deleteAvatar, newAvatarKey: mocks.newAvatarKey }));
vi.mock("@/server/person-tag-repository", () => ({ listPersonTags: mocks.listPersonTags }));

import { deletePersonAction, savePersonAction, type PersonFormState } from "./actions";

const idle: PersonFormState = { status: "idle", message: "" };

function validForm() {
  const form = new FormData();
  form.set("mode", "create");
  form.set("id", "new-player");
  form.set("displayName", "新选手");
  form.set("kind", "human");
  form.set("color", "#168f83");
  form.set("aliases", "new-player");
  form.set("tenhouAccounts", "tenhou-name");
  form.set("majsoulAccounts", "");
  form.set("otherAccounts", "");
  form.set("majsoulRank", "雀豪2");
  form.set("majsoulCelestialLevel", "");
  form.set("tags", "国企办公厅");
  return form;
}

describe("person actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(true);
    mocks.createPerson.mockResolvedValue(undefined);
    mocks.getPerson.mockResolvedValue(null);
    mocks.updatePerson.mockResolvedValue(undefined);
    mocks.putAvatar.mockResolvedValue(undefined);
    mocks.deleteAvatar.mockResolvedValue(undefined);
    mocks.newAvatarKey.mockReturnValue("people/new-player/avatar-key");
    mocks.detectAvatarContentType.mockReturnValue("image/png");
    mocks.listPersonTags.mockResolvedValue(["国企办公厅"]);
  });

  it("rejects visitors before writing", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const state = await savePersonAction(idle, validForm());
    expect(state.message).toBe("需要管理员登录");
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("creates a normalized person and redirects", async () => {
    await expect(savePersonAction(idle, validForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.createPerson).toHaveBeenCalledWith(expect.objectContaining({ id: "new-player", displayName: "新选手", kind: "human", tags: ["国企办公厅"], majsoulRank: "雀豪2" }));
    expect(mocks.redirect).toHaveBeenCalledWith("/players/new-player");
  });

  it("rejects a tag that the administrator has not created", async () => {
    const form = validForm();
    form.set("tags", "伪造标签");
    const state = await savePersonAction(idle, form);
    expect(state.message).toBe("人物标签已变更，请刷新页面后重新选择");
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("rejects a rank outside the shared Mahjong Soul options", async () => {
    const form = validForm();
    form.set("majsoulRank", "最强段位");
    const state = await savePersonAction(idle, form);
    expect(state.message).toBe("请选择有效的雀魂段位");
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("requires a valid level for Celestial and stores it", async () => {
    const invalid = validForm();
    invalid.set("majsoulRank", "魂天");
    invalid.set("majsoulCelestialLevel", "21");
    expect((await savePersonAction(idle, invalid)).message).toBe("魂天等级必须选择 Lv.1 至 Lv.20");
    expect(mocks.createPerson).not.toHaveBeenCalled();

    const valid = validForm();
    valid.set("majsoulRank", "魂天");
    valid.set("majsoulCelestialLevel", "7");
    await expect(savePersonAction(idle, valid)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.createPerson).toHaveBeenCalledWith(expect.objectContaining({ majsoulRank: "魂天", majsoulCelestialLevel: 7 }));
  });

  it("does not accept a Celestial level for another rank", async () => {
    const form = validForm();
    form.set("majsoulCelestialLevel", "2");
    const state = await savePersonAction(idle, form);
    expect(state.message).toBe("仅魂天段位可以设置魂天等级");
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("does not allow an edit request to change the person ID", async () => {
    const form = validForm();
    form.set("mode", "edit");
    form.set("originalId", "existing-player");
    const state = await savePersonAction(idle, form);
    expect(state.message).toBe("人物 ID 不允许修改");
    expect(mocks.updatePerson).not.toHaveBeenCalled();
  });

  it("stores a validated avatar with a new person", async () => {
    const form = validForm();
    form.set("avatar", new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "avatar.png", { type: "image/png" }));

    await expect(savePersonAction(idle, form)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.putAvatar).toHaveBeenCalledWith("people/new-player/avatar-key", expect.any(Uint8Array), "image/png");
    expect(mocks.createPerson).toHaveBeenCalledWith(expect.objectContaining({
      avatarKey: "people/new-player/avatar-key",
      avatarContentType: "image/png",
      avatarVersion: expect.any(Number),
    }));
  });

  it("removes an existing avatar after updating the person", async () => {
    const form = validForm();
    form.set("mode", "edit");
    form.set("originalId", "new-player");
    form.set("removeAvatar", "on");
    mocks.getPerson.mockResolvedValue({
      id: "new-player",
      displayName: "新选手",
      kind: "human",
      color: "#168f83",
      aliases: ["新选手"],
      accounts: [],
      avatarKey: "people/new-player/old-avatar",
      avatarVersion: 1,
      avatarContentType: "image/png",
    });

    await expect(savePersonAction(idle, form)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.updatePerson).toHaveBeenCalledWith(expect.not.objectContaining({ avatarKey: expect.anything() }));
    expect(mocks.deleteAvatar).toHaveBeenCalledWith("people/new-player/old-avatar");
  });
});

describe("delete person action", () => {
  function confirmation(value: string) {
    const form = new FormData();
    form.set("confirmation", value);
    return form;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(true);
    mocks.deletePerson.mockResolvedValue({ id: "明轩", avatarKey: "people/test/old-avatar" });
    mocks.deleteAvatar.mockResolvedValue(undefined);
  });

  it("rejects visitors before deleting any data", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect(await deletePersonAction("明轩", idle, confirmation("明轩"))).toMatchObject({ status: "error" });
    expect(mocks.deletePerson).not.toHaveBeenCalled();
    expect(mocks.deleteAvatar).not.toHaveBeenCalled();
  });

  it("requires a valid ID and exact confirmation", async () => {
    expect(await deletePersonAction("../invalid", idle, confirmation("../invalid"))).toMatchObject({ status: "error" });
    expect(await deletePersonAction("明轩", idle, confirmation("明轩 "))).toMatchObject({ status: "error" });
    expect(mocks.deletePerson).not.toHaveBeenCalled();
  });

  it("deletes the person and avatar before redirecting outside error handling", async () => {
    await expect(deletePersonAction("明轩", idle, confirmation("明轩"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.deletePerson).toHaveBeenCalledWith("明轩");
    expect(mocks.deleteAvatar).toHaveBeenCalledWith("people/test/old-avatar");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/players");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/players/${encodeURIComponent("明轩")}`);
    expect(mocks.redirect).toHaveBeenCalledWith("/players");
  });

  it("preserves the avatar when deletion is blocked or the person is missing", async () => {
    mocks.deletePerson.mockRejectedValue(new Error("人物仍关联比赛"));
    expect(await deletePersonAction("明轩", idle, confirmation("明轩"))).toEqual({ status: "error", message: "人物仍关联比赛" });
    expect(mocks.deleteAvatar).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not report deletion failure when subsequent avatar cleanup fails", async () => {
    mocks.deleteAvatar.mockRejectedValue(new Error("Storage unavailable"));
    await expect(deletePersonAction("明轩", idle, confirmation("明轩"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/players");
  });
});
