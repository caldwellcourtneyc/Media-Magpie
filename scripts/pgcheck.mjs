// Rehearses a move to a hosted Postgres before any of your data goes there for real. Starts a throwaway
// copy of the app against its own scratch schema in that database, imports an export file, exports it
// back and compares every row, tries a capture with an image, a delete and a restore, then drops the
// scratch schema. Nothing outside the scratch schema is touched.
//
//   HOSTED_DATABASE_URL=postgres://...  node scripts/pgcheck.mjs <export.json>
//
// HOSTED_DATABASE_URL may also live in .env.local (the app itself never reads it). Needs a production
// build first: npm run build. The file must carry its images' bytes (Settings > Export, or /api/export).

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = process.cwd();
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const PORT = 3995;

function fromEnvFile(name) {
  try {
    const m = new RegExp(`^${name}=(.*)$`, "m").exec(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8"));
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const raw = process.env.HOSTED_DATABASE_URL || fromEnvFile("HOSTED_DATABASE_URL");
const file = process.argv[2];
if (!raw || !file) {
  console.error("Usage: HOSTED_DATABASE_URL=... node scripts/pgcheck.mjs <export.json>");
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(2);
}

// A scratch schema needs a startup option, which Neon's pooled address refuses, so use the direct one.
const direct = new URL(raw);
direct.hostname = direct.hostname.replace("-pooler.", ".");
const schema = "pgcheck_" + crypto.randomBytes(4).toString("hex");
const scoped = new URL(direct);
scoped.searchParams.set("options", `-c search_path=${schema}`);

let passed = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const admin = new pg.Client({ connectionString: direct.toString() });
await admin.connect();
await admin.query(`create schema ${schema}`);
console.log(`scratch schema ${schema}`);

const PASSWORD = "pgcheck-" + crypto.randomBytes(6).toString("hex");
const TOKEN = crypto.randomBytes(24).toString("hex");
const child = spawn(process.execPath, [NEXT, "start", "-p", String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "production", DATABASE_URL: scoped.toString(), POSTGRES_URL: "", APP_PASSWORD: PASSWORD, API_TOKEN: TOKEN, AIR_DATES: "off", MOVIE_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
const base = `http://localhost:${PORT}`;

async function call(method, p, body) {
  const r = await fetch(base + p, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, data };
}

// Rows as the export gives them, minus the air-date cache (never imported, refetched by the app).
const rowsOf = (exp, k) =>
  new Map(exp[k].map((r) => [r.id, JSON.stringify(k === "items" ? { ...r, airInfo: undefined } : r)]));

try {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(base + "/login", { redirect: "manual" });
      if (r.status < 500) break;
    } catch {
      /* not up yet */
    }
    if (i > 120) throw new Error(`server did not start:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const health = await call("GET", "/api/health");
  check("the app reaches the hosted database", health.status === 200 && String(health.data.database).startsWith("postgres"), JSON.stringify(health.data));
  check("the scratch copy starts empty", health.data.rows && Object.values(health.data.rows).every((n) => n === 0), JSON.stringify(health.data.rows));

  const src = JSON.parse(fs.readFileSync(file, "utf8"));
  check("the file carries its images' bytes", (src.images ?? []).every((im) => im.data), "(use an export, not a daily backup)");
  const imp = await call("POST", "/api/import", src);
  check("import", imp.status === 200, JSON.stringify(imp.data).slice(0, 300));

  const out = (await call("GET", "/api/export")).data;
  for (const k of ["items", "logs", "captures", "images"]) {
    const a = rowsOf(src, k);
    const b = rowsOf(out, k);
    const differ = [...a.keys()].filter((id) => a.get(id) !== b.get(id));
    check(`${k}: ${b.size} back of ${a.size}, every one the same`, a.size === b.size && differ.length === 0, differ.slice(0, 3).map((id) => `\n    in:  ${a.get(id)}\n    out: ${b.get(id) ?? "(missing)"}`).join(""));
  }
  const again = await call("POST", "/api/import", src);
  check("importing the same file again adds nothing", again.status === 200 && JSON.stringify(again.data.before) === JSON.stringify(again.data.after));

  // A capture with an image, a delete and a restore: the writes the hosted copy will see most.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const made = await call("POST", "/api/captures", { body: "pgcheck", kind: "note", image: { type: "image/png", data: png } });
  const cap = made.data?.capture;
  check("a capture with an image saves", made.status === 200 && cap?.image?.id, JSON.stringify(made.data).slice(0, 300));
  if (cap?.image?.id) {
    const r = await fetch(`${base}/api/images/${cap.image.id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const bytes = Buffer.from(await r.arrayBuffer());
    check("its image comes back byte for byte", r.status === 200 && bytes.equals(Buffer.from(png, "base64")));
    const del = await call("DELETE", `/api/captures/${cap.id}`);
    const res = await call("POST", "/api/restore", { kind: "capture", id: cap.id });
    const back = await call("GET", `/api/captures/${cap.id}`);
    check("delete and restore", del.status === 200 && res.status === 200 && back.status === 200);
  }

  const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: PASSWORD }) });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const page = await fetch(base + "/", { headers: { cookie }, redirect: "manual" });
  check("sign in and the home page loads", login.status === 200 && page.status === 200, `${login.status} ${page.status}`);
  const state = await fetch(base + "/api/state", { headers: { cookie } });
  check("the page's data loads", state.status === 200);
} catch (e) {
  failures.push(String(e instanceof Error ? e.message : e));
  console.log("  FAIL ", e instanceof Error ? e.message : e);
} finally {
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill();
  });
  await admin.query(`drop schema ${schema} cascade`);
  await admin.end();
  console.log(`scratch schema ${schema} dropped`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(log.split("\n").filter((l) => /error|fail/i.test(l)).slice(-15).join("\n"));
  process.exitCode = 1;
}
