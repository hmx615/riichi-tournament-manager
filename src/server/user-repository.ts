import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import {
  hashAppUserPassword,
  normalizeUsername,
  verifyAppUserPassword,
  type AppUser,
  type AppUserRole,
} from "@/domain/app-user";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";

const usersFile = path.join(dataDirectory, "app-users.json");

type AppUserRow = {
  id: string;
  username: string;
  display_name: string;
  person_id: string | null;
  role: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

function fromRow(row: AppUserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? "",
    personId: row.person_id || null,
    role: row.role === "admin" ? "admin" : "player",
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

async function localUsers(): Promise<AppUser[]> {
  try {
    const value = JSON.parse(await fs.readFile(usersFile, "utf8")) as AppUser[];
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalUsers(users: AppUser[]) {
  await fs.mkdir(path.dirname(usersFile), { recursive: true });
  const temporary = `${usersFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(users, null, 2)}\n`, { flag: "w" });
  try {
    await fs.rename(temporary, usersFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function listAppUsers(): Promise<AppUser[]> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("SELECT * FROM app_users ORDER BY role, username").all<AppUserRow>();
    return result.results.map(fromRow);
  }
  return (await localUsers()).sort((left, right) => left.role.localeCompare(right.role) || left.username.localeCompare(right.username));
}

export async function getAppUserByUsername(username: string): Promise<AppUser | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT * FROM app_users WHERE username = ?").bind(normalized).first<AppUserRow>();
    return row ? fromRow(row) : null;
  }
  return (await localUsers()).find((user) => normalizeUsername(user.username) === normalized) ?? null;
}

export async function getAppUser(id: string): Promise<AppUser | null> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT * FROM app_users WHERE id = ?").bind(id).first<AppUserRow>();
    return row ? fromRow(row) : null;
  }
  return (await localUsers()).find((user) => user.id === id) ?? null;
}

export async function createAppUser(input: {
  username: string;
  displayName?: string;
  personId: string | null;
  role?: AppUserRole;
  password: string;
}) {
  const username = normalizeUsername(input.username);
  if (await getAppUserByUsername(username)) throw new Error("该账号已存在");
  const now = new Date().toISOString();
  const user: AppUser = {
    id: crypto.randomUUID(),
    username,
    displayName: input.displayName?.trim() || "",
    personId: input.personId,
    role: input.role ?? "player",
    passwordHash: await hashAppUserPassword(input.password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    try {
      await db.prepare(`
        INSERT INTO app_users (id, username, display_name, person_id, role, password_hash, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(user.id, user.username, user.displayName, user.personId, user.role, user.passwordHash, user.createdAt, user.updatedAt).run();
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new Error("该账号已存在");
      throw error;
    }
    return user;
  }
  await writeLocalUsers([...(await localUsers()), user]);
  return user;
}

export async function updateAppUser(
  id: string,
  patch: { displayName?: string; personId?: string | null; role?: AppUserRole; password?: string },
) {
  const current = await getAppUser(id);
  if (!current) throw new Error("账号不存在");
  const next: AppUser = {
    ...current,
    displayName: patch.displayName === undefined ? current.displayName : patch.displayName.trim(),
    personId: patch.personId === undefined ? current.personId : patch.personId,
    role: patch.role ?? current.role,
    passwordHash: patch.password ? await hashAppUserPassword(patch.password) : current.passwordHash,
    updatedAt: new Date().toISOString(),
  };
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    await db.prepare(`
      UPDATE app_users SET display_name = ?, person_id = ?, role = ?, password_hash = ?, updated_at = ?
      WHERE id = ?
    `).bind(next.displayName, next.personId, next.role, next.passwordHash, next.updatedAt, id).run();
    return next;
  }
  await writeLocalUsers((await localUsers()).map((user) => (user.id === id ? next : user)));
  return next;
}

export async function deleteAppUser(id: string) {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("DELETE FROM app_users WHERE id = ?").bind(id).run();
    return result.meta.changes === 1;
  }
  const users = await localUsers();
  const remaining = users.filter((user) => user.id !== id);
  if (remaining.length === users.length) return false;
  await writeLocalUsers(remaining);
  return true;
}

export async function recordAppUserLogin(id: string) {
  const now = new Date().toISOString();
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    await db.prepare("UPDATE app_users SET last_login_at = ? WHERE id = ?").bind(now, id).run();
    return;
  }
  await writeLocalUsers((await localUsers()).map((user) => (user.id === id ? { ...user, lastLoginAt: now } : user)));
}

export async function verifyAppUserCredentials(username: string, password: string) {
  const user = await getAppUserByUsername(username);
  if (!user) return null;
  return await verifyAppUserPassword(password, user.passwordHash) ? user : null;
}
