// Images on captures. The page shrinks a picked image on your device (a few hundred KB) before
// it is sent; the server checks it is really an image of an allowed kind and not too big, then
// keeps the bytes in the database. Exports carry them inline; local daily backups keep each
// image once, as a file in the backup folder's images/ (lib/backup.ts).

import { createHash } from "node:crypto";
import { BadInput } from "./errors";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
/** The largest image the server keeps. The page sends well under this (it aims for about 400 KB). */
export const MAX_IMAGE_BYTES = 1024 * 1024;

export type ImageIn = { type: string; data: string; width?: number | null; height?: number | null };
export type ImageOk = { mime: ImageType; buf: Buffer; width: number | null; height: number | null };

/** The file's first bytes, so a mislabeled or hostile upload is refused. */
function sniff(buf: Buffer): ImageType | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const side = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 20000 ? v : null);

/** Checks an image sent as base64 (a data: URL prefix is allowed). Throws BadInput with a plain reason. */
export function checkImage(raw: unknown): ImageOk {
  if (!raw || typeof raw !== "object") throw new BadInput("image: send { type, data } with the data as base64");
  const { type, data, width, height } = raw as ImageIn;
  if (typeof data !== "string" || !data) throw new BadInput("image: data is missing");
  const b64 = data.replace(/^data:[^,]*;base64,/, "").replace(/\s+/g, "");
  // A rough cap before decoding, so a huge string is refused without building a huge buffer.
  if (b64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) throw new BadInput(`image: too big (the limit is ${MAX_IMAGE_BYTES / 1024} KB)`);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new BadInput("image: data is not base64");
  return checkImageBytes(Buffer.from(b64, "base64"), type, width, height);
}

/** The same checks on bytes already in hand (an image file in the backup folder). */
export function checkImageBytes(buf: Buffer, type?: string | null, width?: unknown, height?: unknown): ImageOk {
  if (buf.length > MAX_IMAGE_BYTES) throw new BadInput(`image: too big (the limit is ${MAX_IMAGE_BYTES / 1024} KB)`);
  const mime = sniff(buf);
  if (!mime) throw new BadInput("image: only JPEG, PNG or WebP");
  if (type && type !== mime) throw new BadInput(`image: the data is ${mime}, not ${type}`);
  return { mime, buf, width: side(width), height: side(height) };
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/**
 * An image's file name in the backup folder's images/ (images are kept there once, not inside every
 * daily file). Built from the id alone, never from a name in a file, so nothing can point outside it.
 */
export function imageFileName(id: string, mime: string): string {
  const safe = /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "h" + createHash("sha256").update(id).digest("hex");
  return `${safe}.${EXT[mime] ?? "bin"}`;
}

/** Bytes from the database: PGlite gives a Uint8Array, pg a Buffer. */
export const toBuffer = (v: unknown): Buffer => (Buffer.isBuffer(v) ? v : Buffer.from(v as Uint8Array));
