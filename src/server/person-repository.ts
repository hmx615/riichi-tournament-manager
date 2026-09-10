import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { Person, PersonAccount } from "@/domain/types";
import { personIdError } from "../domain/person-id";
import { tournamentDatabase, usesD1Storage } from "@/server/cloudflare-storage";
import { dataDirectory } from "@/server/data-directory";
import { listCompetitions } from "@/server/competition-repository";

const peopleFile = path.join(dataDirectory, "people.json");

function validatePersonId(id: string) {
  const error = personIdError(id);
  if (error) throw new Error(error);
}

function parsePerson(document: string) {
  return JSON.parse(document) as Person;
}

export async function listPeople(): Promise<Person[]> {
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const result = await db.prepare("SELECT document FROM people ORDER BY created_at, id")
      .all<{ document: string }>();
    return result.results.map((row) => parsePerson(row.document));
  }
  const people = JSON.parse(await fs.readFile(peopleFile, "utf8")) as Person[];
  return people;
}

export async function getPerson(id: string): Promise<Person | null> {
  validatePersonId(id);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const row = await db.prepare("SELECT document FROM people WHERE id = ?")
      .bind(id)
      .first<{ document: string }>();
    return row ? parsePerson(row.document) : null;
  }
  return (await listPeople()).find((person) => person.id === id) || null;
}

async function writePeople(people: Person[]) {
  const temporary = `${peopleFile}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(people, null, 2)}\n`, { flag: "wx" });
  try {
    await fs.rename(temporary, peopleFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function createPerson(person: Person) {
  validatePersonId(person.id);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const now = new Date().toISOString();
    try {
      await db.prepare("INSERT INTO people (id, document, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)")
        .bind(person.id, JSON.stringify(person), now, now)
        .run();
      return;
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new Error("人物 ID 已存在");
      throw error;
    }
  }
  const people = await listPeople();
  if (people.some((item) => item.id === person.id)) throw new Error("人物 ID 已存在");
  people.push(person);
  await writePeople(people);
}

export async function updatePerson(person: Person) {
  validatePersonId(person.id);
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const current = await db.prepare("SELECT version FROM people WHERE id = ?")
      .bind(person.id)
      .first<{ version: number }>();
    if (!current) throw new Error("人物不存在");
    const result = await db.prepare("UPDATE people SET document = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(JSON.stringify(person), new Date().toISOString(), person.id, current.version)
      .run();
    if (!result.success || result.meta.changes !== 1) throw new Error("人物数据已被其他操作更新，请刷新后重试");
    return;
  }
  const people = await listPeople();
  const index = people.findIndex((item) => item.id === person.id);
  if (index < 0) throw new Error("人物不存在");
  people[index] = person;
  await writePeople(people);
}

export type ConfirmedPersonAccount = { personId: string; account: PersonAccount };

export async function rememberPersonAccounts(mappings: ConfirmedPersonAccount[]) {
  const unique = [...new Map(mappings.map((mapping) => [JSON.stringify([mapping.personId, mapping.account]), mapping])).values()];
  if (!unique.length) return;
  for (const { personId, account } of unique) {
    validatePersonId(personId);
    if (!account.username || !["tenhou", "majsoul", "other"].includes(account.platform)) throw new Error("平台账号无效");
  }
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    // Append to the current JSON document so concurrent profile edits are not overwritten.
    const results = await db.batch(unique.map(({ personId, account }) => db.prepare(`
      UPDATE people SET document = json_insert(document, '$.accounts[#]', json(?)),
        version = version + 1, updated_at = ?
      WHERE id = ? AND NOT EXISTS (
        SELECT 1 FROM json_each(people.document, '$.accounts') AS account
        WHERE json_extract(account.value, '$.platform') = ? AND json_extract(account.value, '$.username') = ?
      )
    `).bind(JSON.stringify(account), new Date().toISOString(), personId, account.platform, account.username)));
    if (results.some((result) => !result.success)) throw new Error("平台账号保存失败");
    for (const { personId } of unique) {
      if (!await getPerson(personId)) throw new Error("参赛人物不存在，请检查人物档案");
    }
    return;
  }
  const people = await listPeople();
  let changed = false;
  for (const { personId, account } of unique) {
    const person = people.find((item) => item.id === personId);
    if (!person) throw new Error("参赛人物不存在，请检查人物档案");
    if (!person.accounts.some((item) => item.platform === account.platform && item.username === account.username)) {
      person.accounts.push(account);
      changed = true;
    }
  }
  if (changed) await writePeople(people);
}

export async function personCompetitions(id: string) {
  validatePersonId(id);
  return (await listCompetitions())
    .filter((competition) => competition.participants.some((participant) => participant.personId === id))
    .map(({ id, name }) => ({ id, name }));
}

export async function deletePerson(id: string): Promise<Person> {
  validatePersonId(id);
  const competitions = await personCompetitions(id);
  if (competitions.length) {
    throw new Error(`人物仍关联以下比赛，不能删除：${competitions.map((competition) => competition.name).join("、")}`);
  }
  if (usesD1Storage()) {
    const db = await tournamentDatabase();
    const current = await db.prepare("SELECT document, version FROM people WHERE id = ?")
      .bind(id).first<{ document: string; version: number }>();
    if (!current) throw new Error("人物不存在或已经删除");
    // Recheck references in the DELETE statement in case a competition was updated after the initial check.
    const result = await db.prepare(`
      DELETE FROM people WHERE id = ? AND version = ? AND NOT EXISTS (
        SELECT 1 FROM competitions, json_each(competitions.document, '$.participants') AS participant
        WHERE json_extract(participant.value, '$.personId') = ?
      )
    `).bind(id, current.version, id).run();
    if (!result.success || result.meta.changes !== 1) {
      throw new Error("人物或关联比赛已被其他操作更新，请刷新后重试");
    }
    return parsePerson(current.document);
  }
  const people = await listPeople();
  const person = people.find((item) => item.id === id);
  if (!person) throw new Error("人物不存在或已经删除");
  const backupDirectory = path.join(dataDirectory, "backups", "people");
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.writeFile(path.join(backupDirectory, `${crypto.randomUUID()}.json`), `${JSON.stringify(person, null, 2)}\n`, { flag: "wx" });
  await writePeople(people.filter((item) => item.id !== id));
  return person;
}
