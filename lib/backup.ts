// Local safety net: when running on the embedded database, every change also
// leaves a full JSON export in ./data/backups, one file per day. The newest 14 are
// kept, then one a week for 8 weeks before that.
// Hosted Postgres (Neon etc.) has its own point-in-time restore, so this only
// runs locally. Each file is a normal export that Settings > Import reads, with one
// difference: capture images are written once each to ./data/backups/images/ and
// the daily file names them instead of carrying the bytes again. Import finds them
// there, so keep that folder beside the daily files.

import fs from "node:fs";
import path from "node:path";
import { imageFileName } from "./images";

const DAILY = 14;
const WEEKLY = 8;
const NAME = /^media-log-(\d{4})-(\d{2})-(\d{2})\.json$/;
let timer: ReturnType<typeof setTimeout> | null = null;

export function backupsEnabled() {
  return !process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.VERCEL && process.env.LOCAL_BACKUPS !== "off";
}

export function backupDir() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "backups"));
}

const imageDir = () => path.join(/*turbopackIgnore: true*/ backupDir(), "images");

/** An image's bytes from the backup folder, or null when it isn't there. Found by id only. */
export function readBackupImage(id: string, mime: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(/*turbopackIgnore: true*/ imageDir(), imageFileName(id, mime)));
  } catch {
    return null;
  }
}

function localDay(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The Monday that starts the week of a backup file's date. */
function weekOf(name: string): string {
  const [, y, m, d] = NAME.exec(name)!;
  const t = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
}

/** Which daily files stay: the newest 14, then the newest of each week, for 8 weeks more. */
export function backupsToKeep(names: string[]): Set<string> {
  const files = names.filter((n) => NAME.test(n)).sort().reverse();
  const keep = new Set(files.slice(0, DAILY));
  const weeks = new Set<string>();
  for (const f of files.slice(DAILY)) {
    const wk = weekOf(f);
    if (weeks.has(wk)) continue;
    if (weeks.size >= WEEKLY) break;
    weeks.add(wk);
    keep.add(f);
  }
  return keep;
}

function writeAtomic(file: string, data: string | Buffer) {
  const tmp = file + ".tmp";
  fs.writeFileSync(/*turbopackIgnore: true*/ tmp, data);
  fs.renameSync(/*turbopackIgnore: true*/ tmp, file);
}

export async function writeBackupNow(): Promise<string | null> {
  if (!backupsEnabled()) return null;
  const { exportAll, getImage } = await import("./repo");
  const data = await exportAll(undefined, { imageData: false });
  const dir = backupDir();
  const imgs = imageDir();
  fs.mkdirSync(/*turbopackIgnore: true*/ imgs, { recursive: true });
  // Images never change under their id, so each is written once. One whose file is missing or
  // the wrong size is (re)written before the daily file that names it.
  for (const im of data.images) {
    const file = path.join(/*turbopackIgnore: true*/ imgs, imageFileName(im.id, im.type));
    let size = -1;
    try {
      size = fs.statSync(/*turbopackIgnore: true*/ file).size;
    } catch {
      /* not written yet */
    }
    if (size !== im.bytes) writeAtomic(file, (await getImage(im.id)).data);
    im.file = `images/${imageFileName(im.id, im.type)}`;
  }
  const file = path.join(/*turbopackIgnore: true*/ dir, `media-log-${localDay()}.json`);
  writeAtomic(file, JSON.stringify(data, null, 1));
  const keep = backupsToKeep(fs.readdirSync(/*turbopackIgnore: true*/ dir));
  for (const f of fs.readdirSync(/*turbopackIgnore: true*/ dir)) {
    if (NAME.test(f) && !keep.has(f)) fs.unlinkSync(path.join(/*turbopackIgnore: true*/ dir, f));
  }
  return file;
}

/** Debounced: a burst of edits makes one backup a few seconds later. */
export function scheduleBackup() {
  if (!backupsEnabled()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    writeBackupNow().catch((e) => console.error("[backup] failed:", e));
  }, 4000);
}
