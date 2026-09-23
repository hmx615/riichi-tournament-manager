import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  createCompetition: vi.fn(),
  listPeople: vi.fn(),
  listPersonTags: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/server/competition-repository", () => ({ createCompetition: mocks.createCompetition }));
vi.mock("@/server/person-repository", () => ({ listPeople: mocks.listPeople }));
vi.mock("@/server/person-tag-repository", () => ({ listPersonTags: mocks.listPersonTags }));

import { createCompetitionAction } from "./actions";

function poolForm(tag = "你瓜提高班") {
  const form = new FormData();
  form.set("name", "你瓜提高班");
  form.set("code", "YOUGUA-TRAINING");
  form.set("creationType", "match_pool");
  form.set("participantCount", "0");
  form.set("plannedMatchCount", "100000");
  form.set("initialPoints", "25000");
  form.set("rankPoints", "30, 10, -10, -30");
  form.set("autoIncludePersonTags", tag);
  return form;
}

describe("create match pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(true);
    mocks.listPersonTags.mockResolvedValue(["你瓜提高班"]);
    mocks.listPeople.mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      id: `person-${index}`,
      displayName: `人物${index}`,
      kind: "human",
      color: "#168f83",
      aliases: [`别名${index}`],
      accounts: [{ platform: "majsoul", username: `雀魂${index}` }],
      tags: ["你瓜提高班"],
    })));
    mocks.createCompetition.mockResolvedValue(undefined);
  });

  it("creates a normal unpinned pool from the selected tag", async () => {
    await expect(createCompetitionAction({ message: "" }, poolForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.createCompetition).toHaveBeenCalledWith(expect.objectContaining({
      id: "yougua-training",
      name: "你瓜提高班",
      format: "four_player",
      status: "active",
      autoIncludePersonTags: ["你瓜提高班"],
      participants: expect.arrayContaining([expect.objectContaining({ personId: "person-0", usernames: ["人物0", "别名0", "雀魂0"] })]),
    }));
    expect(mocks.redirect).toHaveBeenCalledWith("/competitions/yougua-training");
  });

  it("rejects a tag that no longer exists", async () => {
    const state = await createCompetitionAction({ message: "" }, poolForm("已删除"));
    expect(state.message).toContain("标签已变更");
    expect(mocks.createCompetition).not.toHaveBeenCalled();
  });
});
