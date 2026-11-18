// Finishes (logs): add, edit, soft-delete.

import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import type { Log } from "../types";
import { BadInput, NotFound } from "../errors";
import { changed } from "./changed";
import { LogInput, LogPatch } from "./inputs";
import { toLog } from "./rows";

export async function addLog(itemId: string, raw: unknown): Promise<Log> {
  const input = LogInput.parse(raw ?? {});
  const db = await getDb();
  const log = await db.tx(async (t) => {
    const it = await t.query(`select id, type, queue from items where id = $1 and deleted_at is null`, [itemId]);
    if (!it[0]) throw new NotFound("No such item");
    const rows = await t.query(
      `insert into logs (id, item_id, finished_on, detail, note) values ($1,$2,$3,$4,$5) returning *`,
      [randomUUID(), itemId, input.finishedOn ?? null, input.detail ?? null, input.note ?? null]
    );
    // A show's In Progress spot is Watching, a state rather than a place in line: a logged season
    // or episode doesn't end it. You move it to Caught up or Done yourself.
    const watching = it[0].type === "tv" && it[0].queue === "in_progress";
    if (!input.keepInQueue && !watching && it[0].queue) {
      await t.query(`update items set queue = null, queued_at = null, sort_pos = null, progress = null, updated_at = now() where id = $1`, [itemId]);
    }
    return toLog(rows[0]);
  });
  changed();
  return log;
}

export async function updateLog(id: string, raw: unknown): Promise<Log> {
  const patch = LogPatch.parse(raw) as Record<string, unknown>;
  const cols: Record<string, string> = { finishedOn: "finished_on", detail: "detail", note: "note" };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(cols)) {
    if (!(k in patch) || patch[k] === undefined) continue;
    vals.push(patch[k]);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) throw new BadInput("Nothing to change");
  vals.push(id);
  const db = await getDb();
  const rows = await db.query(
    `update logs set ${sets.join(", ")}, updated_at = now() where id = $${vals.length} and deleted_at is null returning *`,
    vals
  );
  if (!rows[0]) throw new NotFound("No such log entry");
  changed();
  return toLog(rows[0]);
}

export async function deleteLog(id: string) {
  const db = await getDb();
  const rows = await db.query(`update logs set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null returning id`, [id]);
  if (!rows[0]) throw new NotFound("No such log entry");
  changed();
  return { ok: true };
}
