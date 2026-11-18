// Captures and their images: read, add, change, soft-delete.

import { randomUUID } from "node:crypto";
import { MEDIA_TYPES } from "../config";
import { getDb, type Db } from "../db";
import type { Capture } from "../types";
import { BadInput, NotFound } from "../errors";
import { checkImage, toBuffer, type ImageOk } from "../images";
import { changed } from "./changed";
import { CaptureInput, CapturePatch, MARK_NEEDS, markOk } from "./inputs";
import { findItem } from "./items";
import { CAP_SELECT, toCapture } from "./rows";

export async function getCapture(id: string, db0?: Db): Promise<Capture> {
  const db = db0 ?? (await getDb());
  const rows = await db.query(`${CAP_SELECT} where c.id = $1 and c.deleted_at is null`, [id]);
  if (!rows[0]) throw new NotFound("No such capture");
  return toCapture(rows[0]);
}

/** One image's bytes, by its id. Removed images still answer, so nothing kept is out of reach. */
export async function getImage(id: string) {
  const db = await getDb();
  const rows = await db.query(`select mime, data from capture_images where id = $1`, [id]);
  if (!rows[0]) throw new NotFound("No such image");
  return { type: String(rows[0].mime), data: toBuffer(rows[0].data) };
}

/**
 * The voice-and-script form of a capture's source: { item: { type, title } } attaches to that item
 * when you have it; otherwise the capture stays standalone with the title as its source.
 */
export async function attachByTitle(b: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { item, ...rest } = b;
  if (item && typeof item === "object" && !rest.itemId) {
    const { type, title } = item as { type?: string; title?: string };
    if (type && title && (MEDIA_TYPES as readonly string[]).includes(type)) {
      const found = await findItem(type, title);
      if (found) rest.itemId = found.id;
      else {
        rest.source ??= title;
        rest.mediaType ??= type;
      }
    }
  }
  return rest;
}

async function assertItem(db: Db, itemId: string | null | undefined) {
  if (!itemId) return;
  const rows = await db.query(`select id from items where id = $1 and deleted_at is null`, [itemId]);
  if (!rows[0]) throw new BadInput("That item does not exist");
}

/** Puts an image on a capture. The one it replaces is soft-deleted, so it can still be recovered. */
async function putImage(db: Db, captureId: string, img: ImageOk) {
  await db.query(`update capture_images set deleted_at = now() where capture_id = $1 and deleted_at is null`, [captureId]);
  await db.query(
    `insert into capture_images (id, capture_id, mime, data, bytes, width, height) values ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), captureId, img.mime, img.buf, img.buf.length, img.width, img.height]
  );
}

export async function createCapture(raw: unknown): Promise<Capture> {
  const input = CaptureInput.parse(raw);
  const img = input.image == null ? null : checkImage(input.image);
  if (!markOk(input, !!img)) throw new BadInput(MARK_NEEDS);
  const db = await getDb();
  await assertItem(db, input.itemId);
  const cap = await db.tx(async (t) => {
    const id = randomUUID();
    await t.query(
      `insert into captures (id, kind, body, item_id, media_type, who, source, url, note, tags, captured_on, detail,
         at_time, talk, talked_on, talk_note, by_claude)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        // Like the app's form: a capture that doesn't say starts as a Note. (The column default is unused.)
        input.kind ?? "note",
        input.body ?? "",
        input.itemId ?? null,
        input.mediaType ?? null,
        input.who ?? null,
        input.source ?? null,
        input.url ?? null,
        input.note ?? null,
        JSON.stringify(input.tags ?? []),
        input.capturedOn ?? null,
        input.detail ?? null,
        input.time ?? null,
        // A capture that arrives already talked about isn't waiting for a talk.
        input.talk ?? false,
        input.talkedOn ?? null,
        input.talkNote ?? null,
        input.byClaude ?? false,
      ]
    );
    if (img) await putImage(t, id, img);
    return getCapture(id, t);
  });
  changed();
  return cap;
}

const CAPTURE_COLS: Record<string, string> = {
  kind: "kind",
  body: "body",
  itemId: "item_id",
  mediaType: "media_type",
  who: "who",
  source: "source",
  url: "url",
  note: "note",
  tags: "tags",
  detail: "detail",
  time: "at_time",
  talk: "talk",
  talkedOn: "talked_on",
  talkNote: "talk_note",
  byClaude: "by_claude",
  capturedOn: "captured_on",
};

/**
 * Changes a capture. Setting talkedOn (after a talk) also turns talk off unless talk is sent too,
 * so it leaves "To talk about". image replaces the picture, or removes it with null.
 */
export async function updateCapture(id: string, raw: unknown): Promise<Capture> {
  const patch = CapturePatch.parse(raw) as Record<string, unknown>;
  const img = patch.image == null ? patch.image : checkImage(patch.image);
  if (patch.talkedOn && patch.talk === undefined) patch.talk = false;
  const db = await getDb();
  if ("itemId" in patch) await assertItem(db, patch.itemId as string | null);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(CAPTURE_COLS)) {
    if (!(k in patch) || patch[k] === undefined) continue;
    vals.push(k === "tags" ? JSON.stringify(patch[k]) : k === "body" ? (patch[k] ?? "") : patch[k]);
    sets.push(`${col} = $${vals.length}${k === "tags" ? "::jsonb" : ""}`);
  }
  if (!sets.length && img === undefined) throw new BadInput("Nothing to change");
  vals.push(id);
  const cap = await db.tx(async (t) => {
    const rows = await t.query(
      `update captures set ${[...sets, "updated_at = now()"].join(", ")} where id = $${vals.length} and deleted_at is null returning id`,
      vals
    );
    if (!rows[0]) throw new NotFound("No such capture");
    if (img === null) await t.query(`update capture_images set deleted_at = now() where capture_id = $1 and deleted_at is null`, [id]);
    else if (img) await putImage(t, id, img as ImageOk);
    const c = await getCapture(id, t);
    // Taking the words out of a capture is fine (it becomes a mark) only if something's left to go on.
    if (!markOk(c, !!c.image)) throw new BadInput(MARK_NEEDS);
    return c;
  });
  changed();
  return cap;
}

export async function deleteCapture(id: string) {
  const db = await getDb();
  const rows = await db.query(`update captures set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null returning id`, [id]);
  if (!rows[0]) throw new NotFound("No such capture");
  changed();
  return { ok: true };
}
