import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  getCompetition: vi.fn(),
  deleteCompetition: vi.fn(),
  updateCompetition: vi.fn(),
  listPeople: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/domain/participant-validation", () => ({ hasDuplicateHumanParticipants: vi.fn(() => false) }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/server/competition-repository", () => ({
  getCompetition: mocks.getCompetition,
  deleteCompetition: mocks.deleteCompetition,
  updateCompetition: mocks.updateCompetition,
}));
vi.mock("@/server/person-repository", () => ({ listPeople: mocks.listPeople }));

import { deleteCompetitionAction, type DeleteCompetitionState } from "./actions";

const idle: DeleteCompetitionState = { status: "idle", message: "" };

function confirmation(value: string) {
  const form = new FormData();
  form.set("confirmation", value);
  return form;
}

describe("delete competition action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(true);
    mocks.getCompetition.mockResolvedValue({ id: "test-cup", code: "TEST-CUP" });
    mocks.deleteCompetition.mockResolvedValue(undefined);
  });

  it("rejects visitors before reading or deleting the competition", async () => {
    mocks.isAdmin.mockResolvedValue(false);

    const state = await deleteCompetitionAction("test-cup", idle, confirmation("TEST-CUP"));

    expect(state.message).toBe("需要管理员登录");
    expect(mocks.getCompetition).not.toHaveBeenCalled();
    expect(mocks.deleteCompetition).not.toHaveBeenCalled();
  });

  it("requires the exact competition code", async () => {
    const state = await deleteCompetitionAction("test-cup", idle, confirmation("test-cup"));

    expect(state.message).toContain("TEST-CUP");
    expect(mocks.deleteCompetition).not.toHaveBeenCalled();
  });

  it("deletes the competition and returns to the competition list", async () => {
    await expect(deleteCompetitionAction("test-cup", idle, confirmation("TEST-CUP"))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.deleteCompetition).toHaveBeenCalledWith("test-cup");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/players");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
