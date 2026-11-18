// Items: read one, find by title, add, change, reorder in a queue section, soft-delete.

import { randomUUID } from "node:crypto";
import { getDb, type Db } from "../db";
import { moveTarget, orderAfter, orderKey, placeFor, queueOrder } from "../order";
import type { Item } from "../types";
import { BadInput, NotFound } from "../errors";
import { changed } from "./changed";
import { ItemInput, ItemPatch, MoveInput } from "./inputs";
import { CAP_SELECT, toCapture, toItem, toLog } from "./rows";

export async function getItem(id: string) {
  const db = await getDb();
  const rows = await db.query(`select * from items where id = $1 and deleted_at is null`, [id]);
  if (!rows[0]) throw new NotFound("No such item");
  const logs = await db.query(
    `select * from logs where item_id = $1 and deleted_at is null order by finished_on desc nulls last, created_at desc`,
    [id]
  );
  const caps = await db.query(`${CAP_SELECT} where c.item_id = $1 and c.deleted_at is null order by c.created_at desc`, [id]);
  return { item: toItem(rows[0]), logs: logs.map(toLog), captures: caps.map(toCapture) };
}

export async function findItem(type: string, title: string): Promise<Item | null> {
  const db = await getDb();
  const rows = await db.query(
    `select * from items where type = $1 and lower(title) = lower($2) and deleted_at is null order by created_at limit 1`,
    [type, title.trim()]
  );
  return rows[0] ? toItem(rows[0]) : null;
}

export async function createItem(raw: unknown, db0?: Db): Promise<Item> {
  const input = ItemInput.parse(raw);
  const db = db0 ?? (await getDb());
  const id = randomUUID();
  const rows = await db.query(
    `insert into items (id, type, entity, title, creator, year, cover_url, lookup_source, lookup_id,
       tier, queue, queued_at, progress, tags, origin, watch_on, status, seasons_seen, disliked, soon_hidden, release_on)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17,$18,$19,$20,$21) returning *`,
    [
      id,
      input.type,
      input.entity ?? "work",
      input.title,
      input.creator ?? null,
      input.year ?? null,
      input.coverUrl ?? null,
      input.lookupSource ?? null,
      input.lookupId ?? null,
      // Not a Fan and a tier exclude each other: Not a Fan wins, so it never arrives with one.
      input.disliked ? null : (input.tier ?? null),
      input.queue ?? null,
      input.queue ? new Date().toISOString() : null,
      input.progress ?? null,
      JSON.stringify(input.tags ?? []),
      input.origin ?? null,
      JSON.stringify(input.watchOn ?? []),
      input.status ?? null,
      input.seasonsSeen ?? null,
      input.disliked ?? false,
      input.soonHidden ?? null,
      input.releaseOn ?? null,
    ]
  );
  changed();
  return toItem(rows[0]);
}

const ITEM_COLS: Record<string, string> = {
  type: "type",
  entity: "entity",
  title: "title",
  creator: "creator",
  year: "year",
  coverUrl: "cover_url",
  lookupSource: "lookup_source",
  lookupId: "lookup_id",
  tier: "tier",
  queue: "queue",
  progress: "progress",
  tags: "tags",
  watchOn: "watch_on",
  status: "status",
  seasonsSeen: "seasons_seen",
  origin: "origin",
  disliked: "disliked",
  soonHidden: "soon_hidden",
  releaseOn: "release_on",
};
const JSON_COLS = new Set(["tags", "watchOn"]);

export async function updateItem(id: string, raw: unknown): Promise<Item> {
  const patch = ItemPatch.parse(raw) as Record<string, unknown>;
  // Not a Fan and a tier exclude each other. Marking something Not a Fan clears its tier, as the page
  // does when you tap it, and wins over a tier sent in the same call.
  if (patch.disliked === true) patch.tier = null;
  const db = await getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(ITEM_COLS)) {
    if (!(k in patch) || patch[k] === undefined) continue;
    vals.push(JSON_COLS.has(k) ? JSON.stringify(patch[k]) : patch[k]);
    sets.push(`${col} = $${vals.length}${JSON_COLS.has(k) ? "::jsonb" : ""}`);
  }
  if ("queue" in patch && patch.queue !== undefined) {
    // Moving into a section stamps the time, so each section lists newest first.
    vals.push(patch.queue ? new Date().toISOString() : null);
    sets.push(`queued_at = $${vals.length}`);
    // Your place in the old section means nothing in the new one. In an UPDATE, queue on the right-hand side is still the old value.
    vals.push(patch.queue);
    sets.push(`sort_pos = case when queue is distinct from $${vals.length} then null else sort_pos end`);
  }
  if ("lookupId" in patch && patch.lookupId !== undefined) {
    // A different match means the cached air dates belong to some other show. In an UPDATE,
    // lookup_id on the right-hand side is still the old value.
    vals.push(patch.lookupId);
    const n = vals.length;
    sets.push(`air_info = case when lookup_id is distinct from $${n} then null else air_info end`);
    sets.push(`air_checked_at = case when lookup_id is distinct from $${n} then null else air_checked_at end`);
  }
  if (!sets.length) throw new BadInput("Nothing to change");
  vals.push(id);
  const rows = await db.query(
    `update items set ${sets.join(", ")}, updated_at = now() where id = $${vals.length} and deleted_at is null returning *`,
    vals
  );
  if (!rows[0]) throw new NotFound("No such item");
  changed();
  return toItem(rows[0]);
}

/** Moves a queued item within its section: to the top, or directly above or below another in that section. */
export async function moveItem(id: string, raw: unknown): Promise<Item> {
  const to = MoveInput.parse(raw);
  const db = await getDb();
  const item = await db.tx(async (t) => {
    const me = (await t.query(`select * from items where id = $1 and deleted_at is null`, [id]))[0];
    if (!me) throw new NotFound("No such item");
    if (!me.queue) throw new BadInput("Only something in a queue can be moved");
    const others = (await t.query(`select * from items where queue = $1 and id <> $2 and deleted_at is null`, [me.queue, id])).map(toItem).sort(queueOrder);
    const target = moveTarget(to);
    if (target !== null && !others.some((o) => o.id === target)) throw new BadInput("That isn't in the same list any more");
    const place = placeFor(others, to);
    if (place !== null) return (await t.query(`update items set sort_pos = $2, updated_at = now() where id = $1 returning *`, [id, place]))[0];
    // No number left in that gap: space the whole section out, keeping its order, with this one in its new place.
    const ids = orderAfter(others, id, to);
    const top = others.length ? orderKey(others[0]) : orderKey(toItem(me));
    for (const [n, x] of ids.entries()) await t.query(`update items set sort_pos = $2, updated_at = now() where id = $1`, [x, top - n * 1000]);
    return (await t.query(`select * from items where id = $1`, [id]))[0];
  });
  changed();
  return toItem(item);
}

/** Soft-deletes the item and, with the same timestamp, its logs and captures, so restore brings back exactly that set. */
export async function deleteItem(id: string) {
  const db = await getDb();
  const at = new Date().toISOString();
  await db.tx(async (t) => {
    const rows = await t.query(`update items set deleted_at = $2, updated_at = now() where id = $1 and deleted_at is null returning id`, [id, at]);
    if (!rows[0]) throw new NotFound("No such item");
    await t.query(`update logs set deleted_at = $2, updated_at = now() where item_id = $1 and deleted_at is null`, [id, at]);
    await t.query(`update captures set deleted_at = $2, updated_at = now() where item_id = $1 and deleted_at is null`, [id, at]);
  });
  changed();
  return { ok: true, deletedAt: at };
}
