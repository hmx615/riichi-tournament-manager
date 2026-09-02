import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/server/person-repository", () => ({ createPerson: mocks.createPerson, updatePerson: mocks.updatePerson }));

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
    mocks.updatePerson.mockResolvedValue(undefined);
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
});
