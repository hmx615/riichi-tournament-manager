import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  createPerson: vi.fn(),
  getPerson: vi.fn(),
  updatePerson: vi.fn(),
  putAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  newAvatarKey: vi.fn(),
  detectAvatarContentType: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/domain/avatar", () => ({ maxAvatarBytes: 2 * 1024 * 1024, detectAvatarContentType: mocks.detectAvatarContentType }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/server/person-repository", () => ({ createPerson: mocks.createPerson, getPerson: mocks.getPerson, updatePerson: mocks.updatePerson }));
vi.mock("@/server/avatar-storage", () => ({ putAvatar: mocks.putAvatar, deleteAvatar: mocks.deleteAvatar, newAvatarKey: mocks.newAvatarKey }));

import { savePersonAction, type PersonFormState } from "./actions";

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
  });

  it("rejects visitors before writing", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const state = await savePersonAction(idle, validForm());
    expect(state.message).toBe("需要管理员登录");
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("creates a normalized person and redirects", async () => {
    await expect(savePersonAction(idle, validForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.createPerson).toHaveBeenCalledWith(expect.objectContaining({ id: "new-player", displayName: "新选手", kind: "human" }));
    expect(mocks.redirect).toHaveBeenCalledWith("/players/new-player");
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
