// First-boot seed for the embedded database only. A seed file is an ordinary
// export file. Order of preference:
//   1. SEED_FILE (env), if set (SEED_FILE=none means start empty)
//   2. data/seed.personal.json (gitignored: your own lists, never committed)
// With neither, a fresh database starts empty: the fictional demo (seed/demo.json)
// no longer loads by itself. The empty library's welcome offers it (POST /api/demo),
// and SEED_FILE=seed/demo.json starts with it.
// Runs once per database: after that, a "seeded" marker stops it, so deleting
// everything never brings the seed back. A database that already has the marker,
// or any rows, is never touched.

import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db";

export async function seedIfFresh(db: Db) {
  const mark = await db.query(`select value from meta where key = 'seeded'`);
  if (mark[0]) return;
  const n = await db.query<{ n: unknown }>(`select count(*) as n from items`);
  if (Number(n[0].n) > 0) {
    await db.query(`insert into meta (key, value) values ('seeded', 'skipped: database had data') on conflict do nothing`);
    return;
  }
  const candidates = [
    process.env.SEED_FILE,
    path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "seed.personal.json"),
  ].filter(Boolean) as string[];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file || process.env.SEED_FILE === "none") {
    await db.query(`insert into meta (key, value) values ('seeded', 'none') on conflict do nothing`);
    return;
  }
  const { importAll } = await import("./repo");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const r = await importAll(data, db);
  await db.query(`insert into meta (key, value) values ('seeded', $1) on conflict do nothing`, [path.basename(file)]);
  console.log(`[seed] loaded ${path.basename(file)}: ${r.after.items} items, ${r.after.logs} logs, ${r.after.captures} captures`);
}
