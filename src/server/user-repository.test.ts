import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/domain/app-user";

const mocks = vi.hoisted(() => ({
  // usersFile 在模块加载时就拼好了，所以目录必须在 import 之前就确定。
  dataDirectory: `${require("node:os").tmpdir()}/app-users-repo-test`,
  usesD1Storage: vi.fn(() => false),
  tournamentDatabase: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/data-directory", () => ({ get dataDirectory() { return mocks.dataDirectory; } }));
vi.mock("@/server/cloudflare-storage", () => ({ usesD1Storage: mocks.usesD1Storage, tournamentDatabase: mocks.tournamentDatabase }));

import { getAppUserByUsername, updateAppUser } from "./user-repository";

const users: AppUser[] = [
  { id: "u1", username: "aniya", displayName: "おでけけ", personId: "aniya", role: "player", passwordHash: "pbkdf2-sha256$1$a$b", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", lastLoginAt: null },
  { id: "u2", username: "dh", displayName: "中華有为", personId: "中華有为", role: "player", passwordHash: "pbkdf2-sha256$1$c$d", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", lastLoginAt: null },
];

describe("选手自助改账号名", () => {
  const directory = mocks.dataDirectory;
  beforeEach(async () => {
    await fs.promises.rm(directory, { recursive: true, force: true });
    await fs.promises.mkdir(directory, { recursive: true });
    mocks.usesD1Storage.mockReturnValue(false);
    await fs.promises.writeFile(path.join(directory, "app-users.json"), JSON.stringify(users));
  });
  afterAll(async () => { await fs.promises.rm(directory, { recursive: true, force: true }); });

  it("可以改成新账号名，并归一化成小写", async () => {
    const next = await updateAppUser("u2", { username: "  ZDH  " });
    expect(next.username).toBe("zdh");
    expect(next.passwordHash).toBe(users[1].passwordHash);
    await expect(getAppUserByUsername("ZDH")).resolves.toMatchObject({ id: "u2", username: "zdh" });
  });

  it("被别人占用的账号名要报错，且不会写坏数据", async () => {
    await expect(updateAppUser("u2", { username: "aniya" })).rejects.toThrow("已经被别人用了");
    const stored = JSON.parse(await fs.promises.readFile(path.join(directory, "app-users.json"), "utf8")) as AppUser[];
    expect(stored.find((user) => user.id === "u2")!.username).toBe("dh");
  });

  it("改成自己原来的名字不会误判成重名", async () => {
    await expect(updateAppUser("u1", { username: "ANIYA" })).resolves.toMatchObject({ username: "aniya" });
  });

  it("改账号名不会动密码、角色和绑定人物", async () => {
    const next = await updateAppUser("u1", { username: "onigiri", displayName: "新昵称" });
    expect(next).toMatchObject({ username: "onigiri", displayName: "新昵称", role: "player", personId: "aniya" });
    expect(next.passwordHash).toBe(users[0].passwordHash);
  });
});
