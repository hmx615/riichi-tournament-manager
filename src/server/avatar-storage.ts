import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { AvatarContentType } from "@/domain/avatar";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";

const localAvatarDirectory = path.join(dataDirectory, "avatars");

function validateAvatarKey(key: string) {
  if (!/^people\/[a-z0-9-]+\/[a-f0-9-]+$/.test(key)) throw new Error("头像存储键格式无效");
}

function localAvatarFile(key: string) {
  validateAvatarKey(key);
  return path.join(localAvatarDirectory, key);
}

export function newAvatarKey(personId: string) {
  if (!/^[a-z0-9-]+$/.test(personId)) throw new Error("人物 ID 格式无效");
  return `people/${personId}/${crypto.randomUUID()}`;
}

export async function putAvatar(key: string, bytes: Uint8Array, contentType: AvatarContentType) {
  validateAvatarKey(key);
  if (usesD1Storage()) {
    const body = Uint8Array.from(bytes).buffer;
    await (await tournamentDatabase()).prepare(
      "INSERT INTO avatars (key, body, content_type, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, content_type = excluded.content_type, created_at = excluded.created_at",
    ).bind(key, body, contentType, new Date().toISOString()).run();
    return;
  }
  const file = localAvatarFile(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
}

export async function getAvatar(key: string): Promise<{ body: BodyInit; etag?: string } | null> {
  validateAvatarKey(key);
  if (usesD1Storage()) {
    const row = await (await tournamentDatabase()).prepare("SELECT body FROM avatars WHERE key = ?")
      .bind(key)
      .first<{ body: ArrayBuffer | number[] }>();
    if (!row) return null;
    const body = row.body instanceof ArrayBuffer ? new Uint8Array(row.body) : Uint8Array.from(row.body);
    return { body };
  }
  try {
    return { body: new Uint8Array(await fs.readFile(localAvatarFile(key))) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteAvatar(key: string) {
  validateAvatarKey(key);
  if (usesD1Storage()) {
    await (await tournamentDatabase()).prepare("DELETE FROM avatars WHERE key = ?").bind(key).run();
    return;
  }
  await fs.rm(localAvatarFile(key), { force: true });
}
