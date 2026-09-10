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

import { deleteCompetitionAction, saveCompetitionSettingsAction, type DeleteCompetitionState } from "./actions";

const idle: DeleteCompetitionState = { status: "idle", message: "" };

function confirmation(value: string) {
  const form = new FormData();
  form.set("confirmation", value);
  return form;
}

function settingsForm() {
  const form = new FormData();
  form.set("competitionId", "test-cup");
  form.set("name", "测试比赛");
  form.set("format", "four_player");
  form.set("participantCount", "4");
  form.set("status", "active");
  form.set("plannedMatchCount", "10");
  form.set("initialPoints", "25000");
  form.set("rankPoints", "30, 10, -10, -30");
  for (let index = 0; index < 4; index += 1) {
    form.set(`participantName${index}`, `选手${index + 1}`);
    form.set(`participantPersonId${index}`, `person-${index + 1}`);
    form.set(`participantUsernames${index}`, `user-${index + 1}`);
    form.set(`participantColor${index}`, "#123456");
  }
  form.set("preliminaryMatches", "0");
  form.set("semifinalMatches", "0");
  form.set("finalMatches", "0");
  return form;
}

it("saves settings without throwing a redirect sentinel", async () => {
  vi.clearAllMocks();
  mocks.isAdmin.mockResolvedValue(true);
  mocks.getCompetition.mockResolvedValue({
    id: "test-cup",
    format: "four_player",
    name: "旧名称",
    status: "draft",
    plannedMatchCount: 10,
    initialPoints: 25000,
    rankPoints: [30, 10, -10, -30],
    participants: [1, 2, 3, 4].map((id) => ({ id: `seat-${id}`, personId: `person-${id}`, displayName: `选手${id}`, usernames: [`user-${id}`], color: "#123456", kind: "human" })),
    matches: [],
  });
  mocks.listPeople.mockResolvedValue([1, 2, 3, 4].map((id) => ({ id: `person-${id}`, displayName: `选手${id}`, kind: "human" })));
  mocks.updateCompetition.mockResolvedValue(undefined);

  await expect(saveCompetitionSettingsAction({ status: "idle", message: "" }, settingsForm())).resolves.toMatchObject({
    status: "success",
    redirectTo: "/competitions/test-cup",
  });
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.updateCompetition).toHaveBeenCalledTimes(1);
});

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
