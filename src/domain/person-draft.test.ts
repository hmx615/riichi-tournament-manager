import { describe, expect, it } from "vitest";
import type { Person } from "@/domain/types";
import { findPersonForDraft, personDraftFromRecord, pickPersonColor, uniquePersonId } from "./person-draft";

const people: Person[] = [
  { id: "番薯", displayName: "番薯", kind: "human", color: "#168f83", aliases: ["番薯", "烤好的香番薯"], accounts: [{ platform: "majsoul", username: "烤好的香番薯" }] },
];

describe("人物草稿", () => {
  it("按字段识别姓名、雀魂昵称、天凤昵称与段位", () => {
    const draft = personDraftFromRecord({
      nickname: "新同学",
      majsoulNickname: "新同学A",
      雀魂ID: "12345678",
      tenhou_nickname: "tenhou-user",
      currentRank: "雀豪2",
      qq: "123456",
    }, { people, defaultTags: ["你瓜提高班"] });
    expect(draft.displayName).toBe("新同学");
    expect(draft.id).toBe("新同学");
    expect(draft.aliases).toEqual(["新同学", "新同学A", "tenhou-user"]);
    expect(draft.accounts).toEqual([
      { platform: "majsoul", username: "新同学A" },
      { platform: "tenhou", username: "tenhou-user" },
    ]);
    expect(draft.majsoulRank).toBe("雀豪2");
    expect(draft.tags).toEqual(["你瓜提高班"]);
    // 雀魂数字 ID 与 QQ 属于隐私字段，不进人物档案，也不出现在提示里
    expect(draft.notes.join(" ")).not.toContain("qq");
    expect(draft.notes.join(" ")).not.toContain("12345678");
  });

  it("换一张表单也能用：字段名不同、没有段位也能填出草稿", () => {
    const draft = personDraftFromRecord({ 姓名: "李四", 雀魂游戏昵称: "李四四" }, { people });
    expect(draft.displayName).toBe("李四");
    expect(draft.aliases).toEqual(["李四", "李四四"]);
    expect(draft.majsoulRank).toBeUndefined();
    expect(draft.tags).toEqual([]);
  });

  it("识别不了的段位只提示、不乱填", () => {
    const draft = personDraftFromRecord({ nickname: "王五", currentRank: "天凤5段" }, { people });
    expect(draft.majsoulRank).toBeUndefined();
    expect(draft.notes.some((note) => note.includes("天凤5段"))).toBe(true);
  });

  it("没识别到的其他字段会列出来供人工确认", () => {
    const draft = personDraftFromRecord({ nickname: "赵六", goals: "想提高防守" }, { people });
    expect(draft.notes.some((note) => note.includes("goals：想提高防守"))).toBe(true);
  });

  it("ID 重名时自动加后缀，颜色挑用得最少的", () => {
    expect(uniquePersonId("番薯", ["番薯"])).toBe("番薯-2");
    expect(uniquePersonId("新人物", ["番薯"])).toBe("新人物");
    expect(pickPersonColor(["#168f83", "#168f83"])).not.toBe("#168f83");
  });

  it("能判断收集记录是否已经建过人物", () => {
    const draft = personDraftFromRecord({ nickname: "番薯", majsoulNickname: "烤好的香番薯" }, { people });
    expect(findPersonForDraft(draft, people)?.id).toBe("番薯");
    const other = personDraftFromRecord({ nickname: "陌生人" }, { people });
    expect(findPersonForDraft(other, people)).toBeNull();
  });
});
