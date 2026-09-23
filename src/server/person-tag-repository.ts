import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_PERSON_TAG, normalizePersonTags } from "@/domain/person-tags";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";

const tagsFile = path.join(dataDirectory, "person-tags.json");
const peopleFile = path.join(dataDirectory, "people.json");
const competitionDirectory = path.join(dataDirectory, "competitions");

function validateTag(name: string) {
  const normalized = name.trim();
  if (!normalized) throw new Error("标签名称不能为空");
  if (normalized.length > 30) throw new Error("标签名称不能超过 30 个字符");
  if (/[,，\n\r]/.test(normalized)) throw new Error("标签名称不能包含逗号或换行");
  return normalized;
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  try {
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function listPersonTags(): Promise<string[]> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("SELECT name FROM person_tags ORDER BY name COLLATE NOCASE")
      .all<{ name: string }>();
    return result.results.map((row) => row.name);
  }
  try {
    const tags = JSON.parse(await fs.readFile(tagsFile, "utf8")) as string[];
    return normalizePersonTags(tags).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [DEFAULT_PERSON_TAG];
    throw error;
  }
}

export async function createPersonTag(name: string) {
  const tag = validateTag(name);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    try {
      await db.prepare("INSERT INTO person_tags (name, created_at) VALUES (?, ?)")
        .bind(tag, new Date().toISOString())
        .run();
      return tag;
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new Error("该标签已存在");
      throw error;
    }
  }
  const tags = await listPersonTags();
  if (tags.includes(tag)) throw new Error("该标签已存在");
  await writeJson(tagsFile, [...tags, tag].sort((left, right) => left.localeCompare(right, "zh-Hans-CN")));
  return tag;
}

export async function deletePersonTag(name: string) {
  const tag = validateTag(name);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const existing = await db.prepare("SELECT name FROM person_tags WHERE name = ?").bind(tag).first<{ name: string }>();
    if (!existing) throw new Error("标签不存在或已经删除");
    const now = new Date().toISOString();
    const results = await db.batch([
      db.prepare("DELETE FROM person_tags WHERE name = ?").bind(tag),
      db.prepare(`
        UPDATE people
        SET document = json_set(document, '$.tags', (
              SELECT json_group_array(value)
              FROM json_each(people.document, '$.tags')
              WHERE value <> ?
            )),
            version = version + 1,
            updated_at = ?
        WHERE EXISTS (
          SELECT 1 FROM json_each(people.document, '$.tags') WHERE value = ?
        )
      `).bind(tag, now, tag),
      db.prepare(`
        UPDATE competitions
        SET document = json_set(document, '$.autoIncludePersonTags', (
              SELECT json_group_array(value)
              FROM json_each(competitions.document, '$.autoIncludePersonTags')
              WHERE value <> ?
            )),
            version = version + 1
        WHERE EXISTS (
            SELECT 1 FROM json_each(competitions.document, '$.autoIncludePersonTags') WHERE value = ?
          )
      `).bind(tag, tag),
    ]);
    if (results.some((result) => !result.success)) throw new Error("标签删除失败");
    return;
  }

  const tags = await listPersonTags();
  if (!tags.includes(tag)) throw new Error("标签不存在或已经删除");
  const people = JSON.parse(await fs.readFile(peopleFile, "utf8")) as Array<{ tags?: string[] }>;
  const updatedPeople = people.map((person) => ({
    ...person,
    tags: normalizePersonTags(person.tags ?? []).filter((item) => item !== tag),
  }));
  const competitionFiles = (await fs.readdir(competitionDirectory)).filter((file) => file.endsWith(".json"));
  const competitions = await Promise.all(competitionFiles.map(async (file) => ({
    file,
    document: JSON.parse(await fs.readFile(path.join(competitionDirectory, file), "utf8")) as { autoIncludePersonTags?: string[] },
  })));
  await writeJson(tagsFile, tags.filter((item) => item !== tag));
  await writeJson(peopleFile, updatedPeople);
  for (const competition of competitions) {
    if (competition.document.autoIncludePersonTags?.includes(tag)) {
      competition.document.autoIncludePersonTags = normalizePersonTags(competition.document.autoIncludePersonTags).filter((item) => item !== tag);
      await writeJson(path.join(competitionDirectory, competition.file), competition.document);
    }
  }
}
