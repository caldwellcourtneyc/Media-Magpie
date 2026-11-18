// What every part of the UI test shares: where things are, the canned lookups, the throwaway server
// and the tally of checks.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The checkout to test: this script's own repo (two folders up), so it runs in a worktree too.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").replace(/\\/g, "/");
export const PORT = 3995;
export const BASE = `http://127.0.0.1:${PORT}`;
export const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "media-log-ui-"));
export const PASSWORD = "ui-test-password";
export const d0 = new Date();
export const TODAY = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;
export const SHOTS = path.join(ROOT, "test-results", "uishots");
fs.mkdirSync(SHOTS, { recursive: true });

// Canned title lookups, so cover finding is tested without reaching Open Library, Apple or the rest. The covers
// are the app's own icon (with a tag apiece), which loads signed in or out.
export const art = (tag) => `${BASE}/apple-icon.png?c=${tag}`;
export const FIXTURE = path.join(TMP, "lookup.json");
fs.writeFileSync(
  FIXTURE,
  JSON.stringify({
    book: [
      { title: "Small Hours in the Orchard", creator: "Mara Ellison", year: 2021, coverUrl: art("orchard"), source: "openlibrary", sourceId: "/works/OL9W" },
      { title: "The Glass Cartographer", creator: "Someone Else", year: null, coverUrl: art("glass"), source: "openlibrary", sourceId: "/works/OL8W" },
    ],
    applebooks: [{ title: "Weather for Beginners", creator: "Paul Andrade", year: 2020, coverUrl: art("weather"), source: "applebooks", sourceId: "41" }],
    // Not "tvmaze": a TVmaze id would send the air-dates refresh to the real site.
    tv: [{ title: "Ember & Ash", creator: "Kestrel+", year: 2024, coverUrl: art("ember"), source: "fixture", sourceId: "7" }],
    // Its cover link doesn't load, so the review draws the missing-cover block at thumbnail size.
    movie: [{ title: "The Quiet Heist", creator: null, year: null, coverUrl: `${BASE}/no-such-cover.png?c=heist`, source: "wikipedia", sourceId: "3" }],
  }),
);

// The example titles on the empty library's ghost shelf; one of them gets a canned cover, the rest find none.
export const EXAMPLES = [...fs.readFileSync(path.join(ROOT, "lib/examples.ts"), "utf8").matchAll(/type: "(\w+)", title: "([^"]+)"/g)].map((m) => ({ type: m[1], title: m[2] }));
export const FIXTURE0 = path.join(TMP, "lookup0.json");
fs.writeFileSync(FIXTURE0, JSON.stringify({ [EXAMPLES[0].type]: [{ title: EXAMPLES[0].title, creator: null, year: null, coverUrl: art("ghost"), source: "fixture", sourceId: "1" }] }));

let slog = "";
/** One server at a time on PORT: each gets its own database folder and the env given. */
export const boot = async (db, env) => {
  slog = "";
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", APP_PASSWORD: PASSWORD, API_TOKEN: "", DATABASE_URL: "", TEST_COPY: "", WATCH_WITH_LABEL: "With Sam", LOCAL_DB_DIR: path.join(TMP, db), BACKUP_DIR: path.join(TMP, db + "-b"), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (slog += d));
  child.stderr.on("data", (d) => (slog += d));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE + "/login")).status < 500) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return child;
};
export const halt = async (child) => {
  if (child && child.exitCode === null) {
    await new Promise((r) => {
      child.once("exit", r);
      child.kill();
    });
  }
  // The port is free once nothing answers on it.
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(BASE + "/login");
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
};

let passed = 0;
const fails = [];
export const ok = (name, cond, extra = "") => {
  if (cond) {
    passed++;
    console.log("  ok   ", name);
  } else {
    fails.push(name);
    console.log("  FAIL ", name, extra);
  }
};

export const COMBOS = [
  { name: "desk-dark", w: 1440, h: 900, scheme: "dark" },
  { name: "phone-light", w: 390, h: 844, scheme: "light" },
  { name: "desk-light", w: 1440, h: 900, scheme: "light" },
  { name: "phone-dark", w: 390, h: 844, scheme: "dark" },
];

/** A crash counts as a failed check, so the run still ends with a tally. */
export const crashed = (e) => {
  fails.push("crash: " + e.message.split("\n")[0]);
  console.error(e);
};

/** Prints the tally (and the end of the server log when something failed). True when everything passed. */
export const report = () => {
  console.log(`\n${passed} passed, ${fails.length} failed${fails.length ? ": " + fails.join("; ") : ""}`);
  if (fails.length) console.log("server log tail:\n" + slog.slice(-1500));
  return fails.length === 0;
};

export const removeTemp = () => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {}
};
