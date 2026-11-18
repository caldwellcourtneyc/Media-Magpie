// Database rows to the objects the app passes around (lib/types.ts).

import type { Row } from "../db";
import type { AirInfo, Capture, ImageRow, Item, Log } from "../types";
import { toBuffer } from "../images";

const iso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
const str = (v: unknown): string | null => (v == null ? null : String(v));
const tags = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const toItem = (r: Row): Item => ({
  id: String(r.id),
  type: r.type as Item["type"],
  entity: (r.entity as Item["entity"]) ?? "work",
  title: String(r.title),
  creator: str(r.creator),
  year: r.year == null ? null : Number(r.year),
  coverUrl: str(r.cover_url),
  lookupSource: str(r.lookup_source),
  lookupId: str(r.lookup_id),
  tier: (r.tier as Item["tier"]) ?? null,
  queue: (r.queue as Item["queue"]) ?? null,
  queuedAt: iso(r.queued_at),
  sortPos: r.sort_pos == null ? null : Number(r.sort_pos),
  progress: str(r.progress),
  tags: tags(r.tags),
  watchOn: tags(r.watch_on),
  status: (r.status as Item["status"]) ?? null,
  seasonsSeen: r.seasons_seen == null ? null : Number(r.seasons_seen),
  origin: str(r.origin),
  disliked: r.disliked === true || r.disliked === "t",
  soonHidden: str(r.soon_hidden),
  releaseOn: str(r.release_on),
  airInfo: airInfo(r.air_info),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  deletedAt: iso(r.deleted_at),
});

function airInfo(v: unknown): AirInfo | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as AirInfo;
    } catch {
      return null;
    }
  }
  return v as AirInfo;
}

export const toLog = (r: Row): Log => ({
  id: String(r.id),
  itemId: String(r.item_id),
  finishedOn: str(r.finished_on),
  detail: str(r.detail),
  note: str(r.note),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  deletedAt: iso(r.deleted_at),
});

export const toCapture = (r: Row): Capture => ({
  id: String(r.id),
  kind: String(r.kind),
  body: String(r.body),
  itemId: str(r.item_id),
  mediaType: (r.media_type as Capture["mediaType"]) ?? null,
  who: str(r.who),
  source: str(r.source),
  url: str(r.url),
  note: str(r.note),
  tags: tags(r.tags),
  detail: str(r.detail),
  time: str(r.at_time),
  talk: r.talk === true || r.talk === "t",
  talkedOn: str(r.talked_on),
  talkNote: str(r.talk_note),
  byClaude: r.by_claude === true || r.by_claude === "t",
  image:
    r.img_id == null
      ? null
      : {
          id: String(r.img_id),
          type: String(r.img_mime),
          bytes: Number(r.img_bytes),
          width: r.img_width == null ? null : Number(r.img_width),
          height: r.img_height == null ? null : Number(r.img_height),
        },
  capturedOn: str(r.captured_on),
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  deletedAt: iso(r.deleted_at),
});

/** Captures with their live image's details (never the bytes, which stay out of /api/state). */
export const CAP_SELECT = `select c.*, ci.id as img_id, ci.mime as img_mime, ci.bytes as img_bytes, ci.width as img_width, ci.height as img_height
  from captures c left join capture_images ci on ci.capture_id = c.id and ci.deleted_at is null`;

export const toImageRow = (r: Row): ImageRow => ({
  id: String(r.id),
  captureId: String(r.capture_id),
  type: String(r.mime),
  bytes: Number(r.bytes),
  width: r.width == null ? null : Number(r.width),
  height: r.height == null ? null : Number(r.height),
  ...(r.data == null ? {} : { data: toBuffer(r.data).toString("base64") }),
  createdAt: iso(r.created_at)!,
  deletedAt: iso(r.deleted_at),
});
