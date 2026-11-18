// The whole library out and in: export, import (merge by id), and loading the demo.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { EXPORT_FORMAT, EXPORT_VERSION, MEDIA_TYPES, QUEUES, STATUSES, TIERS } from "../config";
import { getDb, type Db } from "../db";
import type { ExportFile } from "../types";
import { backupDir, readBackupImage } from "../backup";
import { BadInput } from "../errors";
import { checkImage, checkImageBytes, imageFileName, type ImageOk } from "../images";
import { normalizeTime } from "../time";
import { changed } from "./changed";
import { webLink } from "./inputs";
import { CAP_SELECT, toCapture, toImageRow, toItem, toLog } from "./rows";

export async function counts(db0?: Db) {
  const db = db0 ?? (await getDb());
  const r = await db.query<{ items: unknown; logs: unknown; captures: unknown; images: unknown }>(
    `select (select count(*) from items) as items, (select count(*) from logs) as logs, (select count(*) from captures) as captures,
       (select count(*) from capture_images) as images`
  );
  return { items: Number(r[0].items), logs: Number(r[0].logs), captures: Number(r[0].captures), images: Number(r[0].images) };
}

/**
 * Everything, including soft-deleted rows and every image's bytes. Nothing is left behind.
 * imageData: false leaves the bytes out (the local backup writes each image to its own file once).
 */
export async function exportAll(db0?: Db, opts: { imageData?: boolean } = {}): Promise<ExportFile> {
  const db = db0 ?? (await getDb());
  const imgCols = opts.imageData === false ? "id, capture_id, mime, bytes, width, height, created_at, deleted_at" : "*";
  const [items, logs, captures, images] = await Promise.all([
    db.query(`select * from items order by created_at, id`),
    db.query(`select * from logs order by created_at, id`),
    db.query(`${CAP_SELECT} order by c.created_at, c.id`),
    db.query(`select ${imgCols} from capture_images order by created_at, id`),
  ]);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { items: items.length, logs: logs.length, captures: captures.length, images: images.length },
    items: items.map(toItem),
    logs: logs.map(toLog),
    captures: captures.map(toCapture),
    images: images.map(toImageRow),
  };
}

const ts = z.union([z.string(), z.null()]).optional();
const ImportItem = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(MEDIA_TYPES),
  entity: z.enum(["work", "creator"]).optional(),
  title: z.string().min(1).max(300),
  creator: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  // Same check as the forms: links are rendered as links, so nothing else gets in through a file.
  coverUrl: webLink.nullable().optional(),
  lookupSource: z.string().nullable().optional(),
  lookupId: z.string().nullable().optional(),
  tier: z.enum(TIERS).nullable().optional(),
  queue: z.enum(QUEUES).nullable().optional(),
  queuedAt: ts,
  progress: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  // Older export files have no watchOn; any string is kept so a changed service list never blocks an import.
  watchOn: z.array(z.string()).optional(),
  // Older export files have neither; an unknown status from a newer app is dropped rather than blocking the import.
  status: z.string().nullable().optional(),
  seasonsSeen: z.number().int().min(0).max(200).nullable().optional(),
  origin: z.string().nullable().optional(),
  // Older export files have neither. airInfo is a cache and is never imported; the app refetches it.
  disliked: z.boolean().optional(),
  soonHidden: z.string().max(20).nullable().optional(),
  // Older export files have no releaseOn; then the date already here is kept.
  releaseOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Older export files have no sortPos; then the place already here is kept.
  sortPos: z.number().nullable().optional(),
  createdAt: ts,
  updatedAt: ts,
  deletedAt: ts,
});
const ImportLog = z.object({
  id: z.string().min(1).max(100),
  itemId: z.string().min(1).max(100),
  finishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  detail: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: ts,
  updatedAt: ts,
  deletedAt: ts,
});
const ImportCapture = z.object({
  id: z.string().min(1).max(100),
  kind: z.string().min(1).max(40),
  // Empty is a mark (saved to finish later).
  body: z.string(),
  itemId: z.string().nullable().optional(),
  mediaType: z.enum(MEDIA_TYPES).nullable().optional(),
  who: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  url: webLink.nullable().optional(),
  note: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  detail: z.string().nullable().optional(),
  // Older export files have none of these five (byClaude below too). capture.image is derived and never imported:
  // the images list below carries the bytes.
  time: z.string().max(20).nullable().optional(),
  talk: z.boolean().optional(),
  talkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  talkNote: z.string().nullable().optional(),
  byClaude: z.boolean().optional(),
  capturedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  createdAt: ts,
  updatedAt: ts,
  deletedAt: ts,
});
const ImportImage = z.object({
  id: z.string().min(1).max(100),
  captureId: z.string().min(1).max(100),
  type: z.string(),
  // A daily backup leaves data out: the image is in the backup folder's images/ (file names it there,
  // but only the id is used to find it).
  data: z.string().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  createdAt: ts,
  deletedAt: ts,
});
const ImportFile = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().max(EXPORT_VERSION),
  items: z.array(ImportItem),
  logs: z.array(ImportLog),
  captures: z.array(ImportCapture),
  // Older export files have no images.
  images: z.array(ImportImage).optional(),
});

/**
 * One column of an imported row: its name, the value the file gives it, and where needed
 * - cast: the Postgres type its placeholder is cast to;
 * - since: the export key it comes from, for a field added after the first export version. A file
 *   without that key doesn't know the field, so on a row that already exists the value here is kept.
 * Adding a field to exports means one line in the list for its table.
 */
type Col<R> = { col: string; val: (row: R, now: string) => unknown; cast?: string; since?: string };

const ITEM_IMPORT: Col<z.infer<typeof ImportItem>>[] = [
  { col: "id", val: (i) => i.id },
  { col: "type", val: (i) => i.type },
  { col: "entity", val: (i) => i.entity ?? "work" },
  { col: "title", val: (i) => i.title },
  { col: "creator", val: (i) => i.creator ?? null },
  { col: "year", val: (i) => i.year ?? null },
  { col: "cover_url", val: (i) => i.coverUrl ?? null },
  { col: "lookup_source", val: (i) => i.lookupSource ?? null },
  { col: "lookup_id", val: (i) => i.lookupId ?? null },
  { col: "tier", val: (i) => i.tier ?? null },
  { col: "queue", val: (i) => i.queue ?? null },
  { col: "queued_at", val: (i) => i.queuedAt ?? null },
  { col: "progress", val: (i) => i.progress ?? null },
  { col: "tags", val: (i) => JSON.stringify(i.tags ?? []), cast: "jsonb" },
  { col: "origin", val: (i) => i.origin ?? null },
  { col: "created_at", val: (i, now) => i.createdAt ?? now },
  { col: "updated_at", val: (i, now) => i.updatedAt ?? now },
  { col: "deleted_at", val: (i) => i.deletedAt ?? null },
  { col: "watch_on", val: (i) => JSON.stringify(i.watchOn ?? []), cast: "jsonb", since: "watchOn" },
  // An unknown status from a newer app is dropped rather than blocking the import.
  { col: "status", val: (i) => ((STATUSES as readonly string[]).includes(i.status ?? "") ? i.status : null), since: "status" },
  { col: "seasons_seen", val: (i) => i.seasonsSeen ?? null, since: "seasonsSeen" },
  { col: "disliked", val: (i) => i.disliked ?? false, since: "disliked" },
  { col: "soon_hidden", val: (i) => i.soonHidden ?? null, since: "soonHidden" },
  { col: "release_on", val: (i) => i.releaseOn ?? null, since: "releaseOn" },
  { col: "sort_pos", val: (i) => i.sortPos ?? null, cast: "double precision", since: "sortPos" },
];

const LOG_IMPORT: Col<z.infer<typeof ImportLog>>[] = [
  { col: "id", val: (l) => l.id },
  { col: "item_id", val: (l) => l.itemId },
  { col: "finished_on", val: (l) => l.finishedOn ?? null },
  { col: "detail", val: (l) => l.detail ?? null },
  { col: "note", val: (l) => l.note ?? null },
  { col: "created_at", val: (l, now) => l.createdAt ?? now },
  { col: "updated_at", val: (l, now) => l.updatedAt ?? now },
  { col: "deleted_at", val: (l) => l.deletedAt ?? null },
];

const CAPTURE_IMPORT: Col<z.infer<typeof ImportCapture>>[] = [
  { col: "id", val: (c) => c.id },
  { col: "kind", val: (c) => c.kind },
  { col: "body", val: (c) => c.body },
  { col: "item_id", val: (c) => c.itemId ?? null },
  { col: "media_type", val: (c) => c.mediaType ?? null },
  { col: "who", val: (c) => c.who ?? null },
  { col: "source", val: (c) => c.source ?? null },
  { col: "url", val: (c) => c.url ?? null },
  { col: "note", val: (c) => c.note ?? null },
  { col: "tags", val: (c) => JSON.stringify(c.tags ?? []), cast: "jsonb" },
  { col: "captured_on", val: (c) => c.capturedOn ?? null },
  { col: "created_at", val: (c, now) => c.createdAt ?? now },
  { col: "updated_at", val: (c, now) => c.updatedAt ?? now },
  { col: "deleted_at", val: (c) => c.deletedAt ?? null },
  { col: "detail", val: (c) => c.detail ?? null, since: "detail" },
  { col: "at_time", val: (c) => (c.time == null ? null : normalizeTime(c.time) || null), since: "time" },
  { col: "talk", val: (c) => c.talk ?? false, since: "talk" },
  { col: "talked_on", val: (c) => c.talkedOn ?? null, since: "talkedOn" },
  { col: "talk_note", val: (c) => c.talkNote ?? null, since: "talkNote" },
  { col: "by_claude", val: (c) => c.byClaude ?? false, since: "byClaude" },
];

/**
 * Adds the file's row, or overwrites the row here that has its id, but only when the file's updatedAt
 * is at least that row's: a row changed here since is kept, and a file row with no updatedAt never
 * overwrites. True when the file's row was written, false when the row here was kept.
 */
async function upsert<R extends { id: string; updatedAt?: string | null }>(t: Db, table: string, cols: Col<R>[], row: R, now: string): Promise<boolean> {
  const params: unknown[] = [];
  const param = (value: unknown, cast?: string) => {
    params.push(value);
    return `$${params.length}${cast ? `::${cast}` : ""}`;
  };
  const values = cols.map((c) => param(c.val(row, now), c.cast));
  const sets = cols
    .filter((c) => c.col !== "id")
    .map((c) => (c.since ? `${c.col} = case when ${param(c.since in row)} then excluded.${c.col} else ${table}.${c.col} end` : `${c.col} = excluded.${c.col}`));
  const stamp = param(row.updatedAt ?? null, "timestamptz");
  const wrote = await t.query(
    `insert into ${table} (${cols.map((c) => c.col).join(", ")}) values (${values.join(", ")})
     on conflict (id) do update set ${sets.join(", ")}
     where ${stamp} is not null and ${stamp} >= ${table}.updated_at
     returning id`,
    params,
  );
  return wrote.length > 0;
}

/**
 * Loads the demo file into an empty library, as ordinary items. Refused when anything live is
 * already here. Rows get fresh ids, so a demo loaded once and deleted can't shadow a later load
 * (an import never overwrites a row changed more recently, and a delete is a change).
 */
export async function loadDemo(file: unknown) {
  const db = await getDb();
  const live = await db.query<{ n: unknown }>(`select count(*) as n from items where deleted_at is null`);
  if (Number(live[0].n) > 0) throw new BadInput("Your library already has things in it, so the demo wasn't loaded.");
  const f = structuredClone(file) as { items?: { id: string }[]; logs?: { id: string; itemId: string }[]; captures?: { id: string; itemId?: string | null }[] };
  const ids = new Map<string, string>();
  for (const i of f.items ?? []) {
    ids.set(i.id, randomUUID());
    i.id = ids.get(i.id)!;
  }
  for (const l of f.logs ?? []) {
    l.id = randomUUID();
    l.itemId = ids.get(l.itemId) ?? l.itemId;
  }
  for (const c of f.captures ?? []) {
    c.id = randomUUID();
    if (c.itemId) c.itemId = ids.get(c.itemId) ?? c.itemId;
  }
  return importAll(f, db);
}

/**
 * Merges an export into this database: rows are matched by id. A row here that changed after the file's
 * version of it is kept (so an older file never rolls back newer edits); otherwise the file's version
 * wins. Rows not in the file are left alone. Never deletes. All-or-nothing: one bad row and nothing is written.
 */
export async function importAll(raw: unknown, db0?: Db) {
  const parsed = ImportFile.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new BadInput(`Not a valid export file (${first.path.join(".") || "root"}: ${first.message})`);
  }
  const f = parsed.data;
  const ids = new Set(f.items.map((i) => i.id));
  const db = db0 ?? (await getDb());
  // Every image is checked like an upload before anything is written. A daily backup carries no bytes
  // (data): an image already here keeps its own, and one that isn't comes from the backup folder.
  const images: (z.infer<typeof ImportImage> & { ok: ImageOk | null })[] = [];
  for (const im of f.images ?? []) {
    let buf: Buffer | null = null;
    if (!im.data) {
      if ((await db.query(`select 1 from capture_images where id = $1`, [im.id]))[0]) {
        images.push({ ...im, ok: null });
        continue;
      }
      buf = readBackupImage(im.id, im.type);
      if (!buf) {
        throw new BadInput(
          `This backup's images aren't where the app looks: it needs images/${imageFileName(im.id, im.type)} inside ${backupDir()}. ` +
            `Copy the backup's images folder there, or set BACKUP_DIR to the folder that holds it, then import again. Nothing was imported.`
        );
      }
    }
    try {
      images.push({ ...im, ok: buf ? checkImageBytes(buf, im.type, im.width, im.height) : checkImage(im) });
    } catch (e) {
      throw new BadInput(`Not a valid export file (image ${im.id}: ${e instanceof Error ? e.message : "unreadable"})`);
    }
  }
  for (const c of f.captures) {
    const t = c.time == null ? null : normalizeTime(c.time);
    if (t === null && c.time != null) throw new BadInput(`Not a valid export file (capture ${c.id}: time ${c.time})`);
  }
  const before = await counts(db);
  const keptHere = await db.tx(async (t) => {
    // Items referenced by logs/captures must exist, either in the file or already here.
    const missing = new Set<string>();
    for (const r of [...f.logs.map((l) => l.itemId), ...f.captures.map((c) => c.itemId).filter(Boolean)] as string[]) {
      if (!ids.has(r)) missing.add(r);
    }
    for (const id of missing) {
      const ok = await t.query(`select 1 from items where id = $1`, [id]);
      if (!ok[0]) throw new BadInput(`The file refers to an item that is not in it or here (${id})`);
    }
    // Likewise the capture each image belongs to.
    const capIds = new Set(f.captures.map((c) => c.id));
    for (const id of new Set(images.map((im) => im.captureId).filter((id) => !capIds.has(id)))) {
      const ok = await t.query(`select 1 from captures where id = $1`, [id]);
      if (!ok[0]) throw new BadInput(`The file has an image for a capture that is not in it or here (${id})`);
    }
    const now = new Date().toISOString();
    const kept = { items: 0, logs: 0, captures: 0 };
    const keptCaptures = new Set<string>();
    for (const i of f.items) if (!(await upsert(t, "items", ITEM_IMPORT, i, now))) kept.items++;
    for (const l of f.logs) if (!(await upsert(t, "logs", LOG_IMPORT, l, now))) kept.logs++;
    for (const c of f.captures) {
      if (await upsert(t, "captures", CAPTURE_IMPORT, c, now)) continue;
      kept.captures++;
      keptCaptures.add(c.id);
    }
    for (const im of images) {
      // A capture kept because it changed here keeps its own image too.
      if (keptCaptures.has(im.captureId)) continue;
      // The file's image wins: a different live image on the same capture is set aside (soft-deleted).
      if (!im.deletedAt) {
        await t.query(`update capture_images set deleted_at = now() where capture_id = $1 and id <> $2 and deleted_at is null`, [im.captureId, im.id]);
      }
      if (!im.ok) {
        // Already here, and the file has no bytes: everything but the picture itself follows the file.
        await t.query(`update capture_images set capture_id = $2, width = $3, height = $4, created_at = $5, deleted_at = $6 where id = $1`, [
          im.id, im.captureId, im.width ?? null, im.height ?? null, im.createdAt ?? now, im.deletedAt ?? null,
        ]);
        continue;
      }
      await t.query(
        `insert into capture_images (id, capture_id, mime, data, bytes, width, height, created_at, deleted_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (id) do update set capture_id=excluded.capture_id, mime=excluded.mime, data=excluded.data,
           bytes=excluded.bytes, width=excluded.width, height=excluded.height, created_at=excluded.created_at,
           deleted_at=excluded.deleted_at`,
        [im.id, im.captureId, im.ok.mime, im.ok.buf, im.ok.buf.length, im.ok.width, im.ok.height, im.createdAt ?? now, im.deletedAt ?? null]
      );
    }
    return kept;
  });
  const after = await counts(db);
  changed();
  return {
    inFile: { items: f.items.length, logs: f.logs.length, captures: f.captures.length, images: images.length },
    before,
    after,
    // Entries the file has an older version of: the newer one here was kept.
    kept: keptHere,
  };
}
