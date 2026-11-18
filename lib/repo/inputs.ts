// What a write may contain: the zod schemas for items, finishes and captures.

import { z } from "zod";
import { CAPTURE_KINDS, MEDIA_TYPES, NOT_ON_MINE, QUEUES, SERVICE_KEYS, STATUSES, TIERS } from "../config";
import { normalizeTime } from "../time";

export const trimmed = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim());
const optText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((s) => (s == null ? s : s.trim() || null));
const day = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"), z.null()])
  .optional();
export const webLink = z.string().max(2000).regex(/^https?:\/\//i, "Links must start with http:// or https://");
const url = z
  .union([webLink, z.literal(""), z.null()])
  .optional()
  .transform((s) => (s ? s : s === "" ? null : s));
const tagList = z.array(z.string().max(60)).max(30).optional();

export const ItemInput = z.object({
  type: z.enum(MEDIA_TYPES),
  entity: z.enum(["work", "creator"]).optional(),
  title: trimmed(300).pipe(z.string().min(1, "Title is required")),
  creator: optText(300),
  year: z.union([z.number().int().min(0).max(3000), z.null()]).optional(),
  coverUrl: url,
  lookupSource: optText(40),
  lookupId: optText(200),
  tier: z.union([z.enum(TIERS), z.null()]).optional(),
  queue: z.union([z.enum(QUEUES), z.null()]).optional(),
  progress: optText(200),
  tags: tagList,
  watchOn: z
    .array(z.enum(SERVICE_KEYS))
    .max(SERVICE_KEYS.length)
    .refine((v) => !v.includes(NOT_ON_MINE) || v.length === 1, "No Access can't be combined with a service")
    .optional(),
  status: z.union([z.enum(STATUSES), z.null()]).optional(),
  seasonsSeen: z.union([z.number().int().min(0).max(200), z.null()]).optional(),
  origin: optText(300),
  disliked: z.boolean().optional(),
  soonHidden: z.union([z.string().regex(/^(s\d{1,3}|release)$/, "Use a season key like s2, or release for a movie"), z.null()]).optional(),
  releaseOn: day,
});
export const ItemPatch = ItemInput.partial();
export const MoveInput = z.union([z.object({ top: z.literal(true) }), z.object({ above: z.string().max(100) }), z.object({ below: z.string().max(100) })]);

export const LogInput = z.object({
  finishedOn: day,
  detail: optText(300),
  note: optText(10000),
  /** Leave the item in its queue section after logging (default: take it out; a show being watched always stays). */
  keepInQueue: z.boolean().optional(),
});
export const LogPatch = LogInput.omit({ keepInQueue: true }).partial();

/** "1309" becomes "13:09"; blank clears it. */
const timeField = z
  .union([z.string().max(20), z.null()])
  .optional()
  .transform((s, ctx) => {
    if (s == null) return s;
    const t = normalizeTime(s);
    if (t === null) {
      ctx.addIssue({ code: "custom", message: "Use a time like 13:09 (or 1309)" });
      return z.NEVER;
    }
    return t || null;
  });

export const CaptureInput = z.object({
  kind: z.enum(CAPTURE_KINDS).optional(),
  // Empty is allowed: a capture with no words yet is a mark, as long as it says where it's from
  // or carries an image (checked in createCapture and updateCapture).
  body: trimmed(20000).optional(),
  itemId: z.union([z.string().max(100), z.null()]).optional(),
  mediaType: z.union([z.enum(MEDIA_TYPES), z.null()]).optional(),
  who: optText(300),
  source: optText(500),
  url,
  note: optText(10000),
  tags: tagList,
  detail: optText(300),
  time: timeField,
  talk: z.boolean().optional(),
  talkedOn: day,
  talkNote: optText(1000),
  byClaude: z.boolean().optional(),
  /** { type, data (base64) , width?, height? } attaches or replaces the image; null removes it. */
  image: z.unknown().optional(),
  capturedOn: day,
});
export const CapturePatch = CaptureInput.partial();

export const MARK_NEEDS = "Write something, or add an image or where it's from to save it as a mark";
/** A mark with nothing to go on can never be finished, so it's refused. */
export const markOk = (c: { body?: string | null; itemId?: string | null; source?: string | null; detail?: string | null; time?: string | null; url?: string | null }, hasImage: boolean) =>
  Boolean(c.body?.trim() || hasImage || c.itemId || c.source || c.detail || c.time || c.url);
