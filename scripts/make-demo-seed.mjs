// Builds seed/demo.json: a small, entirely fictional library to look around in. A fresh copy
// starts empty; the welcome on Now loads this on request, and SEED_FILE=seed/demo.json starts
// with it. Every title, person and quote here is made up.
// Run: node scripts/make-demo-seed.mjs
import fs from "node:fs";
import path from "node:path";

let n = 0;
const id = (p) => `demo-${p}-${String(++n).padStart(3, "0")}`;
const now = "2026-01-01T12:00:00.000Z";
const items = [];
const logs = [];
const captures = [];

function item(type, title, creator, extra = {}) {
  const it = {
    id: id("item"),
    type,
    entity: "work",
    title,
    creator,
    year: null,
    coverUrl: null,
    lookupSource: null,
    lookupId: null,
    tier: null,
    queue: null,
    queuedAt: null,
    progress: null,
    tags: [],
    origin: "the demo seed",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...extra,
  };
  items.push(it);
  return it;
}
function log(it, finishedOn, note = null, detail = null) {
  logs.push({ id: id("log"), itemId: it.id, finishedOn, detail, note, createdAt: now, updatedAt: now, deletedAt: null });
}
function cap(body, extra = {}) {
  captures.push({
    id: id("cap"),
    kind: "quote",
    body,
    itemId: null,
    mediaType: null,
    who: null,
    source: null,
    url: null,
    note: null,
    tags: [],
    capturedOn: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...extra,
  });
}

const lighthouse = item("tv", "The Lighthouse Accounts", "Northwind TV", { tier: "top", year: 2025 });
log(lighthouse, "2026-09-28", "Demo note: the finale earned every slow episode before it.", "Season 1");
const orchard = item("book", "Small Hours in the Orchard", "Mara Ellison", { tier: "fave", year: 2021 });
log(orchard, "2026-09-12", "Demo note: read it in two sittings.");
const static_ = item("music", "Static Garden", "The Paper Kites Club", { tier: "top" });
log(static_, "2026-09-03");
const heist = item("movie", "The Quiet Heist", "Dana Ruiz", { tier: "love", year: 1998 });
log(heist, "2025-12-20");
log(heist, "2026-08-22", null, null);
const field = item("podcast", "Field Notes Weekly", "Ivo Brandt", { tier: "fave", queue: "in_progress", queuedAt: "2026-09-01T12:00:00.000Z" });
log(field, "2026-08-14", null, "The one about tide pools");
const atlas = item("book", "An Atlas of Lost Rivers", "Theo Marsh", { year: 2019 });
log(atlas, "2026-07-30");
item("tv", "Ember & Ash", "Kestrel+", { queue: "in_progress", queuedAt: "2026-09-20T12:00:00.000Z", progress: "S1 E5" });
const glass = item("book", "The Glass Cartographer", "Ines Okafor", { queue: "in_progress", queuedAt: "2026-09-25T12:00:00.000Z", progress: "p. 140" });
item("book", "Weather for Beginners", "Paul Andrade", { queue: "up_next", queuedAt: "2026-09-18T12:00:00.000Z" });
item("movie", "Northbound Local", "Sana Petrova", { queue: "up_next", queuedAt: "2026-09-10T12:00:00.000Z" });
item("music", "Lantern Season", "Oda & the Wires", { queue: "up_next", queuedAt: "2026-08-30T12:00:00.000Z" });
item("tv", "Second Shift", "Harbor Channel", { queue: "saved", queuedAt: "2026-06-02T12:00:00.000Z" });
item("book", "A Short History of Long Walks", "Ruth Calder", { queue: "saved", queuedAt: "2026-05-11T12:00:00.000Z" });
const tinker = item("book", "The Tinker's Daughter", "Mara Ellison", { tier: "top" });
log(tinker, null);
const paper = item("movie", "Paper Moonrise", "Lev Adair", { tier: "fave" });
log(paper, null);
item("music", "Wren Halloway", null, { entity: "creator", tier: "fave" });

cap("We keep the lights on for the boats we will never meet.", { itemId: lighthouse.id, who: "Captain Rhee", capturedOn: "2026-09-28" });
cap("Idea: a playlist that only plays songs from the year each friend was born.", { kind: "idea", capturedOn: "2026-09-15" });
cap("Every map is a list of things someone decided to leave out.", { itemId: glass.id, capturedOn: "2026-09-26" });
cap("Patience is just attention that has learned to wait.", { who: "Ivo Brandt", itemId: field.id, capturedOn: "2026-08-14" });
cap("The best rooms have a window and a reason to stay.", { source: "a friend's newsletter", capturedOn: null });

const file = {
  format: "media-log-export",
  version: 1,
  exportedAt: now,
  counts: { items: items.length, logs: logs.length, captures: captures.length },
  items,
  logs,
  captures,
};
const out = path.join(process.cwd(), "seed", "demo.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(file, null, 1) + "\n");
console.log(`wrote ${out}: ${items.length} items, ${logs.length} logs, ${captures.length} captures`);
