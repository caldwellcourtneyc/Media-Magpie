// Whole-library reads: everything the page shows, what is in Recently deleted, and undoing a delete.

import { getDb } from "../db";
import type { State } from "../types";
import { NotFound } from "../errors";
import { changed } from "./changed";
import { CAP_SELECT, toCapture, toItem, toLog } from "./rows";
import { getLibby, getTypeOrder } from "./settings";

export async function getState(): Promise<State> {
  const db = await getDb();
  const [items, logs, captures] = await Promise.all([
    db.query(`select * from items where deleted_at is null order by created_at`),
    db.query(
      `select l.* from logs l join items i on i.id = l.item_id
       where l.deleted_at is null and i.deleted_at is null
       order by l.finished_on desc nulls last, l.created_at desc`
    ),
    db.query(`${CAP_SELECT} where c.deleted_at is null order by c.captured_on desc nulls last, c.created_at desc`),
  ]);
  return { items: items.map(toItem), logs: logs.map(toLog), captures: captures.map(toCapture), libby: await getLibby(db), typeOrder: await getTypeOrder(db) };
}

export async function getTrash() {
  const db = await getDb();
  const [items, logs, captures] = await Promise.all([
    db.query(`select * from items where deleted_at is not null order by deleted_at desc limit 200`),
    db.query(
      `select l.*, i.title as item_title, i.type as item_type from logs l join items i on i.id = l.item_id
       where l.deleted_at is not null and i.deleted_at is null order by l.deleted_at desc limit 200`
    ),
    db.query(
      `${CAP_SELECT} left join items i on i.id = c.item_id
       where c.deleted_at is not null and (i.id is null or i.deleted_at is null) order by c.deleted_at desc limit 200`
    ),
  ]);
  return {
    items: items.map(toItem),
    logs: logs.map((r) => ({ ...toLog(r), itemTitle: String(r.item_title), itemType: String(r.item_type) })),
    captures: captures.map(toCapture),
  };
}

export async function restore(kind: "item" | "log" | "capture", id: string) {
  const db = await getDb();
  if (kind === "item") {
    await db.tx(async (t) => {
      const rows = await t.query<{ deleted_at: unknown }>(`select deleted_at from items where id = $1`, [id]);
      if (!rows[0] || rows[0].deleted_at == null) throw new NotFound("Nothing to restore");
      const at = rows[0].deleted_at;
      await t.query(`update logs set deleted_at = null, updated_at = now() where item_id = $1 and deleted_at = $2`, [id, at]);
      await t.query(`update captures set deleted_at = null, updated_at = now() where item_id = $1 and deleted_at = $2`, [id, at]);
      await t.query(`update items set deleted_at = null, updated_at = now() where id = $1`, [id]);
    });
  } else {
    const table = kind === "log" ? "logs" : "captures";
    const rows = await db.query(
      `update ${table} set deleted_at = null, updated_at = now() where id = $1 and deleted_at is not null returning id`,
      [id]
    );
    if (!rows[0]) throw new NotFound("Nothing to restore");
  }
  changed();
  return { ok: true };
}
