// Pulls a full export from a hosted copy and keeps it as a dated file, so a hosted library has the
// same daily safety net the embedded database gets on its own. Run it on a schedule from a machine
// you trust (Task Scheduler, cron).
//
//   MEDIA_LOG_URL=https://your-app.example  MEDIA_LOG_TOKEN=<the hosted API_TOKEN>  node scripts/backup-pull.mjs
//
// Both values may also live in .env.local. Files land in MEDIA_LOG_BACKUP_DIR (else BACKUP_DIR, else
// ./data/backups; its own name keeps a local server's backups out of the hosted folder) as
// media-log-hosted-YYYY-MM-DD.json, kept like the local backups: the newest 14, then one a week for
// 8 weeks before that. Capture images are fetched one at a time and saved once each in images/ beside
// them, the same folder and names the local backups use, so the daily files stay small and no single
// request passes a host's size cap. Restore one with Import on a copy of the app whose BACKUP_DIR is
// this folder: it reads the images from there.
// Exits non-zero on any failure, so the scheduler shows it. On Windows a failure also pops a
// notification (BACKUP_NOTIFY=off turns that off), since nobody reads a scheduler's last result.
// BACKUP_ALERT_CMD runs a command of yours on failure, with a title and a message as its last two
// arguments (say, one that files a note in your task tracker). It's split on spaces, so keep any
// path in it free of spaces.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALERT_TITLE = "Media Magpie backup failed";
function notify(body) {
  // Best effort, both: an alert that can't be sent must not hide the failure it reports.
  const alertCmd = (process.env.BACKUP_ALERT_CMD || fromEnvFile("BACKUP_ALERT_CMD") || "").trim();
  if (alertCmd) {
    const [cmd, ...args] = alertCmd.split(/\s+/);
    // "node" means this same Node, so a scheduler's thinner PATH can't miss it.
    const r = spawnSync(cmd === "node" ? process.execPath : cmd, [...args, ALERT_TITLE, body], { timeout: 30_000, stdio: "ignore", windowsHide: true });
    if (r.status !== 0) console.error(`BACKUP_ALERT_CMD did not succeed (${r.error?.message ?? `exit ${r.status}`})`);
  }
  if (process.platform !== "win32" || (process.env.BACKUP_NOTIFY || fromEnvFile("BACKUP_NOTIFY")) === "off") return;
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "notify.ps1");
  spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Title", ALERT_TITLE, "-Body", body], {
    timeout: 15_000,
    stdio: "ignore",
    windowsHide: true,
  });
}

const DAILY = 14;
const WEEKLY = 8;
const PREFIX = "media-log-hosted-";
const NAME = /^media-log-hosted-(\d{4})-(\d{2})-(\d{2})\.json$/;

function fromEnvFile(name) {
  try {
    const m = new RegExp(`^${name}=(.*)$`, "m").exec(fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8"));
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const base = (process.env.MEDIA_LOG_URL || fromEnvFile("MEDIA_LOG_URL") || "").replace(/\/+$/, "");
// Not .env.local's API_TOKEN: that one belongs to the local server, the hosted copy has its own.
const token = process.env.MEDIA_LOG_TOKEN || fromEnvFile("MEDIA_LOG_TOKEN");
const dir = path.resolve(
  process.env.MEDIA_LOG_BACKUP_DIR || fromEnvFile("MEDIA_LOG_BACKUP_DIR") || process.env.BACKUP_DIR || fromEnvFile("BACKUP_DIR") || path.join(process.cwd(), "data", "backups"),
);
const imgDir = path.join(dir, "images");
if (!base || !token) {
  console.error("Set MEDIA_LOG_URL and MEDIA_LOG_TOKEN (environment or .env.local).");
  notify("MEDIA_LOG_URL or MEDIA_LOG_TOKEN is missing, so nothing was saved.");
  process.exit(2);
}

const day = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

// Same as imageFileName in lib/images.ts: the import looks for exactly this name.
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
function imageFileName(id, mime) {
  const safe = /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "h" + crypto.createHash("sha256").update(id).digest("hex");
  return `${safe}.${EXT[mime] ?? "bin"}`;
}

// Same rule as backupsToKeep in lib/backup.ts, for the hosted files.
function weekOf(name) {
  const [, y, m, d] = NAME.exec(name);
  const t = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10);
}
function toKeep(names) {
  const files = names.filter((n) => NAME.test(n)).sort().reverse();
  const keep = new Set(files.slice(0, DAILY));
  const weeks = new Set();
  for (const f of files.slice(DAILY)) {
    const wk = weekOf(f);
    if (weeks.has(wk)) continue;
    if (weeks.size >= WEEKLY) break;
    weeks.add(wk);
    keep.add(f);
  }
  return keep;
}

function writeAtomic(file, data) {
  fs.writeFileSync(file + ".tmp", data);
  fs.renameSync(file + ".tmp", file);
}

const get = (p) => fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });

try {
  const res = await get("/api/export?images=none");
  if (!res.ok) throw new Error(`export answered ${res.status}`);
  const data = JSON.parse(await res.text());
  // Only keep something that is really an export; a login page or error body must not replace a good file.
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.logs) || !Array.isArray(data.captures) || !Array.isArray(data.images) || !data.counts) {
    throw new Error("the response is not an export file");
  }

  fs.mkdirSync(imgDir, { recursive: true });
  // Images never change under their id, so each is fetched once. One whose file is missing or the
  // wrong size is (re)fetched before the daily file that names it is written.
  let fetched = 0;
  for (const im of data.images) {
    const name = imageFileName(im.id, im.type);
    const file = path.join(imgDir, name);
    let size = -1;
    try {
      size = fs.statSync(file).size;
    } catch {
      /* not saved yet */
    }
    if (size !== im.bytes) {
      const r = await get(`/api/images/${encodeURIComponent(im.id)}`);
      if (!r.ok) throw new Error(`image ${im.id} answered ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length !== im.bytes) throw new Error(`image ${im.id} came back ${buf.length} bytes, expected ${im.bytes}`);
      writeAtomic(file, buf);
      fetched++;
    }
    im.file = `images/${name}`;
  }

  const previous = fs
    .readdirSync(dir)
    .filter((f) => NAME.test(f))
    .sort()
    .reverse();
  const file = path.join(dir, `${PREFIX}${day}.json`);
  writeAtomic(file, JSON.stringify(data, null, 1));

  const c = data.counts;
  console.log(`saved ${file}: ${c.items} items, ${c.logs} finishes, ${c.captures} captures, ${c.images} images (${fetched} new)`);
  const last = previous.find((f) => f !== path.basename(file));
  if (last) {
    const before = JSON.parse(fs.readFileSync(path.join(dir, last), "utf8")).counts;
    const fewer = ["items", "logs", "captures", "images"].some((k) => before && (c[k] ?? 0) < (before[k] ?? 0));
    if (fewer) {
      // Deletes are soft and exports include deleted rows, so a count going down means something is wrong.
      console.warn(`WARNING: fewer entries than ${last} (${before.items}/${before.logs}/${before.captures}/${before.images ?? 0}). Older backups are kept; check before importing anything.`);
      notify(`Today's copy has fewer entries than ${last}. Older backups are kept; check before importing anything.`);
      process.exitCode = 1;
    }
  }
  const keep = toKeep(fs.readdirSync(dir));
  for (const f of fs.readdirSync(dir)) if (NAME.test(f) && !keep.has(f)) fs.unlinkSync(path.join(dir, f));
} catch (e) {
  console.error("backup failed:", e instanceof Error ? e.message : e);
  notify(`${e instanceof Error ? e.message : e}. Yesterday's backup is still there; the log is data/backups/backup-pull.log.`);
  // exitCode, not exit(): exiting while a fetch's socket is still closing crashes Node on Windows.
  process.exitCode = 1;
}
