// End-to-end check of every flow, through the HTTP API, against throwaway copies of
// the app with their own temporary databases. Never touches ./data.
// Needs a production build first: npm run build && npm run selftest
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const NEXT = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "media-log-selftest-"));
const PASSWORD = "selftest-" + crypto.randomBytes(6).toString("hex");
const TOKEN = crypto.randomBytes(24).toString("hex");
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

if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

async function start(port, env) {
  const child = spawn(process.execPath, [NEXT, "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "", POSTGRES_URL: "", MOVIE_API_KEY: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(base + "/login", { redirect: "manual" });
      if (r.status < 500) return { child, base, log: () => log };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`server on ${port} did not start:\n${log}`);
}
async function stop(s) {
  if (s.child.exitCode !== null) return;
  await new Promise((resolve) => {
    s.child.once("exit", resolve);
    s.child.kill();
  });
}

function client(base, auth = "bearer") {
  let cookie = "";
  async function call(method, p, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (auth === "bearer") headers.Authorization = `Bearer ${TOKEN}`;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    let data = null;
    const text = await r.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: r.status, data, headers: r.headers };
  }
  return { call, get cookie() { return cookie; } };
}

const dbDir = (n) => path.join(TMP, `db${n}`);
// Canned title lookups, so cover finding is tested without reaching Open Library, Apple or the rest.
const FIXTURE = path.join(TMP, "lookup.json");
const AIR_DAY = new Date(Date.now() + 9 * 86400_000).toISOString().slice(0, 10);
const cv = (name) => `https://covers.example/${name}.jpg`;
fs.writeFileSync(
  FIXTURE,
  JSON.stringify({
    book: [{ title: "Selftest Cover Book", creator: "Ada Lovelace", year: 2020, coverUrl: cv("book"), source: "openlibrary", sourceId: "/works/OL1W" }],
    applebooks: [{ title: "Selftest Apple Book: A Novel", creator: "Bea Writer", year: 2023, coverUrl: cv("apple"), source: "applebooks", sourceId: "9" }],
    tv: [
      { title: "Selftest Only Show", creator: "Somenet", year: 2020, coverUrl: cv("only"), source: "tvmaze", sourceId: "77" },
      { title: "Selftest Logged Show", creator: "Somenet", year: 2021, coverUrl: cv("logged"), source: "tvmaze", sourceId: "78" },
      { title: "Selftest Twin Show", creator: null, year: null, coverUrl: cv("twin1"), source: "tvmaze", sourceId: "11" },
      { title: "Selftest Twin Show", creator: null, year: null, coverUrl: cv("twin2"), source: "tvmaze", sourceId: "12" },
    ],
    movie: [{ title: "Selftest Remake", creator: null, year: 1980, coverUrl: cv("old"), source: "wikipedia", sourceId: "5" }],
    music: [
      { title: "Selftest Down Album", creator: "The Outage", year: 2019, coverUrl: cv("down"), source: "itunes", sourceId: "30" },
      { title: "Selftest Flaky Album", creator: "The Retries", year: 2019, coverUrl: cv("flaky"), source: "itunes", sourceId: "31" },
      { title: "Selftest Flaky Mine", creator: "The Retries", year: 2020, coverUrl: cv("flaky2"), source: "itunes", sourceId: "32" },
    ],
    // Searches containing this text fail that many times first, the way a lookup site that is down or refusing requests does.
    fail: [{ q: "Selftest Down", times: 99 }, { q: "Flaky Album", times: 1 }, { q: "Flaky Mine", times: 1 }],
    // A lookup that got no answer is due again this soon, so the retry checks don't wait minutes.
    coverRetryMs: 300,
    // Canned TVmaze answers by show id, so the air-dates refresh never reaches the site either.
    airdates: {
      77: { status: "Running", _embedded: { nextepisode: { season: 2, number: 1, airdate: AIR_DAY }, seasons: [{ number: 1, premiereDate: "2020-01-05", endDate: "2020-03-01", episodeOrder: 8 }, { number: 2, premiereDate: AIR_DAY, endDate: null, episodeOrder: 8 }] } },
      79: { status: "Running", _embedded: { nextepisode: { season: 2, number: 1, airdate: AIR_DAY }, seasons: [{ number: 1, premiereDate: "2020-01-05", endDate: "2020-03-01", episodeOrder: 8 }, { number: 2, premiereDate: AIR_DAY, endDate: null, episodeOrder: 8 }] } },
    },
  }),
);
const common = (n) => ({ APP_PASSWORD: PASSWORD, API_TOKEN: TOKEN, LOCAL_DB_DIR: dbDir(n), BACKUP_DIR: path.join(TMP, `backups${n}`), SEED_FILE: path.join(ROOT, "seed", "demo.json"), LOOKUP_FIXTURE: FIXTURE });
const sortById = (arr) => [...arr].sort((a, b) => a.id.localeCompare(b.id));
const today = new Date().toISOString().slice(0, 10);

let A, B, C, D;
try {
  console.log(`Temp folder: ${TMP}\n\nStarting a throwaway server...`);
  A = await start(3999, common(1));

  console.log("\nSign-in");
  const anon = client(A.base, "none");
  check("API refuses a request with no session", (await anon.call("GET", "/api/state")).status === 401);
  check("pages redirect to the sign-in screen", [302, 307, 308].includes((await anon.call("GET", "/")).status));
  check("wrong password is refused", (await anon.call("POST", "/api/login", { password: "nope" })).status === 401);
  const login = await anon.call("POST", "/api/login", { password: PASSWORD });
  check("right password signs in", login.status === 200 && anon.cookie.startsWith("ml_session="));
  check("session cookie opens the API", (await anon.call("GET", "/api/state")).status === 200);
  const headers = (await anon.call("GET", "/login")).headers;
  check("security headers are set", headers.get("x-frame-options") === "DENY" && headers.get("x-content-type-options") === "nosniff" && !!headers.get("content-security-policy"));

  const api = client(A.base);
  const st0 = (await api.call("GET", "/api/state")).data;
  check("bearer token opens the API, demo seed loaded", st0.items.length > 0);

  console.log("\nOrder of types");
  const DEFAULT_ORDER = ["tv", "movie", "music", "podcast", "book"];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check("unset, the order of types reads as the default", same((await api.call("GET", "/api/settings")).data.typeOrder, DEFAULT_ORDER) && same(st0.typeOrder, DEFAULT_ORDER));
  for (const bad of [["tv", "movie", "music", "podcast"], ["tv", "tv", "music", "podcast", "book"], ["tv", "movie", "music", "podcast", "book", "game"], ["tv", "movie", "music", "podcast", "comic"], "tv", null]) {
    const r = await api.call("PUT", "/api/settings", { typeOrder: bad });
    check(`PUT refuses a type order that isn't the five once each (${JSON.stringify(bad)})`, r.status === 400, r.status);
  }
  check("a refused order leaves the default in place", same((await api.call("GET", "/api/settings")).data.typeOrder, DEFAULT_ORDER));
  const libbyBefore = (await api.call("PUT", "/api/settings", { libby: [{ key: "selftestlib", name: "Selftest" }] })).data.libby;
  const NEW_ORDER = ["book", "podcast", "tv", "music", "movie"];
  const putOrder = await api.call("PUT", "/api/settings", { typeOrder: NEW_ORDER });
  check("PUT saves a new type order and returns it", putOrder.status === 200 && same(putOrder.data.typeOrder, NEW_ORDER));
  check("saving the order leaves the Libby libraries alone", same(putOrder.data.libby, libbyBefore) && libbyBefore.length === 1);
  check("the order round-trips through GET /api/settings and /api/state", same((await api.call("GET", "/api/settings")).data.typeOrder, NEW_ORDER) && same((await api.call("GET", "/api/state")).data.typeOrder, NEW_ORDER));
  const orderExport = (await api.call("GET", "/api/export")).data;
  check("the order of types is not part of exports", !("typeOrder" in orderExport) && !JSON.stringify(orderExport).includes("type_order"));
  await api.call("PUT", "/api/settings", { libby: [] });
  check("saving Libby leaves the order alone", same((await api.call("GET", "/api/settings")).data.typeOrder, NEW_ORDER));
  check("the default order saves back", same((await api.call("PUT", "/api/settings", { typeOrder: DEFAULT_ORDER })).data.typeOrder, DEFAULT_ORDER));
  await api.call("PUT", "/api/settings", { libby: [{ key: "selftestlib", name: "Selftest" }] });
  check("a Libby code that isn't letters, numbers and dashes is refused", (await api.call("PUT", "/api/settings", { libby: [{ key: "not a code!", name: "Nowhere" }] })).status === 400);
  const cleared = (await api.call("PUT", "/api/settings", {})).data;
  check("a body with neither key clears the Libby list, as it always has, and leaves the order", same(cleared.libby, []) && same(cleared.typeOrder, DEFAULT_ORDER));

  console.log("\nHistory: log, note, rewatch");
  const made = await api.call("POST", "/api/items", { type: "movie", title: "Selftest Picture", creator: "A. Director", log: { finishedOn: today, note: "First time." } });
  check("log a finished item with a note", made.status === 200 && made.data.log?.note === "First time.");
  const mid = made.data.item.id;
  const again = await api.call("POST", `/api/items/${mid}/logs`, { finishedOn: today, note: "Second time." });
  check("re-log a rewatch", again.status === 200);
  let st = (await api.call("GET", "/api/state")).data;
  const mine = st.logs.filter((l) => l.itemId === mid);
  check("rewatch adds an entry and keeps the first", mine.length === 2 && mine.some((l) => l.note === "First time.") && mine.some((l) => l.note === "Second time."));
  const undated = await api.call("POST", `/api/items/${mid}/logs`, { finishedOn: null });
  check("a finish can be undated", undated.status === 200 && undated.data.log.finishedOn === null);
  const edited = await api.call("PATCH", `/api/logs/${again.data.log.id}`, { note: "Second time, edited." });
  check("edit a log's note", edited.data.log?.note === "Second time, edited.");

  console.log("\nFavorites: set and change a tier");
  check("set tier Fave", (await api.call("PATCH", `/api/items/${mid}`, { tier: "fave" })).data.item?.tier === "fave");
  check("change to Top Shelf", (await api.call("PATCH", `/api/items/${mid}`, { tier: "top" })).data.item?.tier === "top");
  check("clear the tier", (await api.call("PATCH", `/api/items/${mid}`, { tier: null })).data.item?.tier === null);
  check("unknown tier is refused", (await api.call("PATCH", `/api/items/${mid}`, { tier: "gold" })).status === 400);

  console.log("\nQueue: move between sections");
  const q = (await api.call("POST", "/api/items", { type: "book", title: "Selftest Novel", queue: "up_next" })).data.item;
  check("add to Up Next", q.queue === "up_next" && !!q.queuedAt);
  check("move to In Progress", (await api.call("PATCH", `/api/items/${q.id}`, { queue: "in_progress", progress: "p. 40" })).data.item?.queue === "in_progress");
  check("move to Saved for Later", (await api.call("PATCH", `/api/items/${q.id}`, { queue: "saved" })).data.item?.queue === "saved");
  await api.call("PATCH", `/api/items/${q.id}`, { queue: "in_progress" });
  await api.call("POST", `/api/items/${q.id}/logs`, { finishedOn: today });
  st = (await api.call("GET", "/api/state")).data;
  check("finishing takes it out of the queue", st.items.find((i) => i.id === q.id).queue === null);
  const watched = (await api.call("POST", "/api/items", { type: "tv", title: "Selftest Watching", queue: "in_progress" })).data.item;
  await api.call("POST", `/api/items/${watched.id}/logs`, { finishedOn: today, detail: "Season 1" });
  st = (await api.call("GET", "/api/state")).data;
  check("logging a season keeps a show in Watching", st.items.find((i) => i.id === watched.id).queue === "in_progress");
  const keeper = (await api.call("POST", "/api/items", { type: "book", title: "Selftest Keeper", queue: "up_next" })).data.item;
  await api.call("POST", `/api/items/${keeper.id}/logs`, { finishedOn: today, keepInQueue: true });
  const kept1 = (await api.call("GET", `/api/items/${keeper.id}`)).data;
  check("keepInQueue logs the finish and leaves it in its section", kept1.item.queue === "up_next" && kept1.logs.length === 1);

  console.log("\nGET /api/items and its filters");
  await api.call("PATCH", `/api/items/${keeper.id}`, { tier: "fave" });
  const listed = async (qs) => (await api.call("GET", `/api/items${qs}`)).data.items;
  st = (await api.call("GET", "/api/state")).data;
  check("with no filter it lists every item", (await listed("")).length === st.items.length);
  const books = await listed("?type=book");
  check("type filters", books.length === st.items.filter((i) => i.type === "book").length && books.every((i) => i.type === "book"));
  const upNext = await listed("?queue=up_next");
  check("queue filters", upNext.some((i) => i.id === keeper.id) && upNext.every((i) => i.queue === "up_next"));
  const faveBooksUpNext = await listed("?type=book&queue=up_next&tier=fave");
  check("tier filters, and the three combine", faveBooksUpNext.some((i) => i.id === keeper.id) && faveBooksUpNext.every((i) => i.type === "book" && i.queue === "up_next" && i.tier === "fave"));

  console.log("\nNot a Fan and a tier exclude each other");
  const nope = (await api.call("PATCH", `/api/items/${keeper.id}`, { disliked: true })).data.item;
  check("marking a Fave Not a Fan clears its tier", nope?.disliked === true && nope.tier === null, JSON.stringify(nope).slice(0, 200));
  check("so it no longer lists under its old tier", !(await listed("?tier=fave")).some((i) => i.id === keeper.id));
  const both = (await api.call("PATCH", `/api/items/${keeper.id}`, { disliked: true, tier: "top" })).data.item;
  check("Not a Fan wins over a tier sent with it", both?.disliked === true && both.tier === null);
  const liked = (await api.call("PATCH", `/api/items/${keeper.id}`, { disliked: false })).data.item;
  check("taking Not a Fan off leaves it unrated, not back at its old tier", liked?.disliked === false && liked.tier === null);
  const bornNope = (await api.call("POST", "/api/items", { type: "movie", title: "Selftest Not For Me", disliked: true, tier: "love" })).data.item;
  check("something added as Not a Fan arrives with no tier", bornNope?.disliked === true && bornNope.tier === null);

  console.log("\nQueue: your own order");
  const addQ = async (title) => (await api.call("POST", "/api/items", { type: "tv", title, queue: "saved" })).data.item;
  const [oA, oB, oC] = [await addQ("Order A"), await addQ("Order B"), await addQ("Order C")];
  const orderNow = async () => {
    const s = (await api.call("GET", "/api/state")).data;
    const key = (i) => i.sortPos ?? Date.parse(i.queuedAt);
    return s.items
      .filter((i) => i.queue === "saved" && i.title.startsWith("Order "))
      .sort((a, b) => key(b) - key(a) || a.id.localeCompare(b.id))
      .map((i) => i.title.slice(6))
      .join("");
  };
  check("newest on top unless moved", (await orderNow()) === "CBA" && oA.sortPos === null);
  const moved = await api.call("POST", `/api/items/${oA.id}/move`, { top: true });
  check("Move to top", (await orderNow()) === "ACB" && typeof moved.data.item?.sortPos === "number");
  await api.call("POST", `/api/items/${oA.id}/move`, { below: oC.id });
  check("move directly below another", (await orderNow()) === "CAB");
  await api.call("POST", `/api/items/${oB.id}/move`, { above: oA.id });
  check("move directly above another", (await orderNow()) === "CBA");
  check("a move leaves the others' places alone", (await api.call("GET", "/api/state")).data.items.find((i) => i.id === oC.id).sortPos === null);
  const oD = await addQ("Order D");
  check("something newly queued still lands on top", (await orderNow()) === "DCBA");
  check("a move beside something in another section is refused", (await api.call("POST", `/api/items/${oA.id}/move`, { above: watched.id })).status === 400);
  check("an unqueued item can't be moved", (await api.call("POST", `/api/items/${q.id}/move`, { top: true })).status === 400);
  await api.call("PATCH", `/api/items/${oB.id}`, { queue: "up_next" });
  const backB = (await api.call("PATCH", `/api/items/${oB.id}`, { queue: "saved" })).data.item;
  check("changing section starts it fresh, on top", backB.sortPos === null && (await orderNow()) === "BDCA");
  // Each move halves the same gap until no number is left between the neighbours; the order must still come out right.
  for (let k = 0; k < 60; k++) await api.call("POST", `/api/items/${k % 2 ? oD.id : oA.id}/move`, { above: oC.id });
  check("60 moves into one gap still land where they should", (await orderNow()) === "BADC");

  console.log("\nCovers");
  // A cover is looked up after the add answers, so wait for it (or for long enough that it would have come).
  const coverOf = async (id, ms = 4000) => {
    let it;
    for (let t = 0; t < ms; t += 250) {
      it = (await api.call("GET", `/api/items/${id}`)).data.item;
      if (it.coverUrl) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    return it;
  };
  const looked = (await api.call("GET", `/api/lookup?type=book&q=${encodeURIComponent("Selftest Cover Book")}`)).data;
  check("GET /api/lookup answers with matches and says where they came from", looked.provider === "Open Library" && looked.results.some((r) => r.title === "Selftest Cover Book" && r.coverUrl === cv("book") && r.source === "openlibrary"), JSON.stringify(looked).slice(0, 200));
  check("a one-letter search asks nobody", same((await api.call("GET", "/api/lookup?type=book&q=a")).data, { results: [], provider: null }));
  check("a lookup for an unknown type is refused", (await api.call("GET", "/api/lookup?type=game&q=chess")).status === 400);
  const cb = (await api.call("POST", "/api/items", { type: "book", title: "Selftest Cover Book", creator: "Ada Lovelace" })).data.item;
  const cbNow = await coverOf(cb.id);
  check("a book added with no cover gets one when title and author match", cbNow.coverUrl === cv("book") && cbNow.lookupSource === "openlibrary");
  const ab = (await api.call("POST", "/api/items", { type: "book", title: "Selftest Apple Book", creator: "Bea Writer" })).data.item;
  check("a book Open Library lacks gets Apple Books' cover (its subtitle ignored)", (await coverOf(ab.id)).coverUrl === cv("apple"));
  const only = (await api.call("POST", "/api/items", { type: "tv", title: "Selftest Only Show", queue: "up_next" })).data.item;
  const onlyNow = await coverOf(only.id);
  check("a show with one exact match gets its cover and TVmaze id", onlyNow.coverUrl === cv("only") && onlyNow.lookupSource === "tvmaze" && onlyNow.lookupId === "77");
  // The state read at the top already ran an air-dates refresh, so this show arrives inside its cooldown.
  let aired;
  for (let t = 0; t < 6000 && !aired?.airInfo; t += 300) {
    aired = (await api.call("GET", "/api/state")).data.items.find((i) => i.id === only.id);
    if (!aired.airInfo) await new Promise((r) => setTimeout(r, 300));
  }
  check(
    "a show added just after an air-dates refresh gets its dates without waiting out the cooldown",
    aired.airInfo?.next?.date === AIR_DAY && aired.airInfo.next.season === 2 && aired.airInfo.season?.premiere === AIR_DAY && aired.airInfo.premieres?.length === 2,
    JSON.stringify(aired.airInfo),
  );
  // Lookups after an add take their turn in the order of the adds. So once the last of these four has its
  // cover, the three before it have had their try, and a cover that must not arrive needs no fixed wait.
  // Opening the page starts the same refresh. Nothing here reads the state, so only the page can have asked.
  const paged = (await api.call("POST", "/api/items", { type: "tv", title: "Selftest Page Show", coverUrl: cv("page"), lookupSource: "tvmaze", lookupId: "79" })).data.item;
  const pageStatus = (await anon.call("GET", "/")).status;
  let viaPage;
  for (let t = 0; t < 6000 && !viaPage?.airInfo; t += 300) {
    viaPage = (await api.call("GET", `/api/items/${paged.id}`)).data.item;
    if (!viaPage.airInfo) await new Promise((r) => setTimeout(r, 300));
  }
  check("opening the page refreshes air dates too, with no state read", pageStatus === 200 && viaPage.airInfo?.next?.date === AIR_DAY, `page ${pageStatus} ${JSON.stringify(viaPage.airInfo)}`);
  await api.call("DELETE", `/api/items/${paged.id}`);
  const twin = (await api.call("POST", "/api/items", { type: "tv", title: "Selftest Twin Show" })).data.item;
  const wrong = (await api.call("POST", "/api/items", { type: "book", title: "Selftest Cover Book", creator: "Someone Else" })).data.item;
  const remake = (await api.call("POST", "/api/items", { type: "movie", title: "Selftest Remake", year: 2024 })).data.item;
  const own = (await api.call("POST", "/api/items", { type: "book", title: "Selftest Cover Book", creator: "Ada Lovelace", coverUrl: cv("mine") })).data.item;
  const viaLog = (await api.call("POST", "/api/logs", { item: { type: "tv", title: "Selftest Logged Show" }, finishedOn: today })).data;
  const viaLogNow = await coverOf(viaLog.itemId);
  const coverNow = async (id) => (await api.call("GET", `/api/items/${id}`)).data.item.coverUrl;
  check("a show sharing its title with another is left for you to check", (await coverNow(twin.id)) === null);
  const twinPick = (await api.call("POST", "/api/covers", { id: twin.id })).data;
  check("the review offers it, marked not sure", twinPick.pick?.coverUrl === cv("twin1") && twinPick.pick.sure === false && twinPick.failed === false);
  check("a different author rules a match out", (await coverNow(wrong.id)) === null && (await api.call("POST", "/api/covers", { id: wrong.id })).data.pick === null);
  check("a film from another year is ruled out", (await coverNow(remake.id)) === null && (await api.call("POST", "/api/covers", { id: remake.id })).data.pick === null);
  check("a cover you gave is never replaced", (await coverNow(own.id)) === cv("mine"));
  check("a show made by POST /api/logs finds its cover too", viaLog.createdItem === true && viaLogNow.coverUrl === cv("logged"));
  const down = (await api.call("POST", "/api/items", { type: "music", title: "Selftest Down Album", creator: "The Outage" })).data.item;
  check("when the lookup site doesn't answer, the add still succeeds, with no cover", down?.title === "Selftest Down Album" && (await coverOf(down.id, 1000)).coverUrl === null);
  const downPick = (await api.call("POST", "/api/covers", { id: down.id })).data;
  check("and the review says it couldn't check, rather than no match", downPick.pick === null && downPick.failed === true, JSON.stringify(downPick));
  // A lookup that got no answer is tried again once it's due, after a state read (or a page load, or the next add).
  const afterRetries = async (id, ms = 6000) => {
    let it;
    for (let t = 0; t < ms; t += 300) {
      await api.call("GET", "/api/state");
      it = (await api.call("GET", `/api/items/${id}`)).data.item;
      if (it.coverUrl) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    return it;
  };
  const flaky = (await api.call("POST", "/api/items", { type: "music", title: "Selftest Flaky Album", creator: "The Retries" })).data.item;
  const mineLater = (await api.call("POST", "/api/items", { type: "music", title: "Selftest Flaky Mine", creator: "The Retries" })).data.item;
  check("a first lookup that got no answer leaves no cover", (await coverOf(flaky.id, 600)).coverUrl === null && (await coverOf(mineLater.id, 300)).coverUrl === null);
  await api.call("PATCH", `/api/items/${mineLater.id}`, { coverUrl: cv("mine2") });
  const flakyNow = await afterRetries(flaky.id);
  check("it is tried again later, and the cover arrives", flakyNow.coverUrl === cv("flaky") && flakyNow.lookupSource === "itunes" && flakyNow.lookupId === "31", JSON.stringify(flakyNow).slice(0, 200));
  await new Promise((r) => setTimeout(r, 600));
  await api.call("GET", "/api/state");
  check("a cover you gave before the retry is never replaced", (await coverOf(mineLater.id, 600)).coverUrl === cv("mine2"));
  const downNow = (await api.call("GET", `/api/items/${down.id}`)).data.item;
  check(
    "a lookup that keeps failing changes nothing you can see: no cover, the item as it was, nothing new in exports",
    downNow.coverUrl === null && downNow.updatedAt === down.updatedAt && !/cover_?(retry|tries)/i.test(JSON.stringify((await api.call("GET", "/api/export")).data) + JSON.stringify(downNow)),
  );
  for (const x of [cb, ab, only, twin, wrong, remake, own, { id: viaLog.itemId }, down, flaky, mineLater]) await api.call("DELETE", `/api/items/${x.id}`);

  console.log("\nWhere to watch");
  const show = (await api.call("POST", "/api/items", { type: "tv", title: "Selftest Series", queue: "up_next", watchOn: ["netflix"] })).data.item;
  check("a queued show records its streaming service", JSON.stringify(show?.watchOn) === '["netflix"]');
  check("change it to two services", JSON.stringify((await api.call("PATCH", `/api/items/${show.id}`, { watchOn: ["hulu", "netflix"] })).data.item?.watchOn) === '["hulu","netflix"]');
  check("an unknown service is refused", (await api.call("PATCH", `/api/items/${show.id}`, { watchOn: ["nope"] })).status === 400);
  check("No Access is kept", JSON.stringify((await api.call("PATCH", `/api/items/${show.id}`, { watchOn: ["none"] })).data.item?.watchOn) === '["none"]');
  check("No Access plus a service is refused", (await api.call("PATCH", `/api/items/${show.id}`, { watchOn: ["none", "hulu"] })).status === 400);
  check("a movie can be one for the theater, alongside a service", JSON.stringify((await api.call("PATCH", `/api/items/${mid}`, { watchOn: ["theater", "hulu"] })).data.item?.watchOn) === '["theater","hulu"]');
  check("items from older files default to no service", st0.items.every((i) => Array.isArray(i.watchOn)));

  console.log("\nCaptures: attached and standalone");
  const c1 = await api.call("POST", "/api/captures", { body: "A line worth keeping.", itemId: mid, who: "Someone", capturedOn: today });
  check("capture attached to an item", c1.status === 200 && c1.data.capture.itemId === mid);
  const c2 = await api.call("POST", "/api/captures", { kind: "link", body: "Good essay", source: "a website", url: "https://example.com/essay" });
  check("standalone capture with source and link", c2.status === 200 && c2.data.capture.itemId === null && c2.data.capture.url === "https://example.com/essay");
  const c3 = await api.call("POST", "/api/captures", { body: "Said on the show.", item: { type: "movie", title: "selftest picture" } });
  check("capture attaches by type and title (voice form)", c3.data.capture?.itemId === mid);
  const c4 = await api.call("POST", "/api/logs", { item: { type: "podcast", title: "Selftest Radio" }, detail: "Episode 1" });
  check("one-step log creates an unknown item", c4.status === 200 && c4.data.createdItem === true);
  check("unsafe link is refused", (await api.call("POST", "/api/captures", { body: "x", url: "javascript:alert(1)" })).status === 400);
  const noKind = await api.call("POST", "/api/captures", { body: "No kind given" });
  check("a capture with no kind is a Note, like the app's form", noKind.data.capture?.kind === "note");
  const rel = await api.call("PATCH", `/api/items/${mid}`, { releaseOn: "2031-05-02" });
  check("a movie takes a release date", rel.data.item?.releaseOn === "2031-05-02");
  check("a bad release date is refused", (await api.call("PATCH", `/api/items/${mid}`, { releaseOn: "May 2" })).status === 400);
  check("a movie hides from Coming soon with the release key", (await api.call("PATCH", `/api/items/${mid}`, { soonHidden: "release" })).data.item?.soonHidden === "release");
  await api.call("PATCH", `/api/items/${mid}`, { soonHidden: null });
  check("bad date is refused", (await api.call("POST", `/api/items/${mid}/logs`, { finishedOn: "yesterday" })).status === 400);
  check("bad type is refused", (await api.call("POST", "/api/items", { type: "game", title: "x" })).status === 400);
  check("non-JSON write is refused", (await fetch(A.base + "/api/items", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "text/plain" }, body: "{}" })).status === 415);
  check("cross-site write is refused", (await api.call("POST", "/api/captures", { body: "x" }, { Origin: "https://evil.example" })).status === 403);

  console.log("\nFollowing, seasons, where a capture came from");
  const pod = (await api.call("POST", "/api/items", { type: "podcast", title: "Selftest Hour", creator: "Host Person" })).data.item;
  check("a new podcast has no explicit status (it reads as following)", pod.status === null);
  check("pause it", (await api.call("PATCH", `/api/items/${pod.id}`, { status: "paused" })).data.item?.status === "paused");
  check("an unknown status is refused", (await api.call("PATCH", `/api/items/${pod.id}`, { status: "finished" })).status === 400);
  const ended = (await api.call("POST", "/api/items", { type: "podcast", title: "Selftest Gone Quiet", status: "ended" })).data.item;
  check("a podcast that stopped production can be marked ended", ended?.status === "ended");
  const series = (await api.call("PATCH", `/api/items/${show.id}`, { status: "following", seasonsSeen: 3 })).data.item;
  check("a show records caught-up status and seasons seen", series?.status === "following" && series?.seasonsSeen === 3);
  check("seasons can't go negative", (await api.call("PATCH", `/api/items/${show.id}`, { seasonsSeen: -1 })).status === 400);
  check("a new item counts as liked, with nothing hidden from Coming Soon", show.disliked === false && show.soonHidden === null && show.airInfo === null);
  check("mark it not liked", (await api.call("PATCH", `/api/items/${show.id}`, { disliked: true })).data.item?.disliked === true);
  check("hide a season from Coming Soon", (await api.call("PATCH", `/api/items/${show.id}`, { soonHidden: "s2" })).data.item?.soonHidden === "s2");
  check("a hide that isn't a season is refused", (await api.call("PATCH", `/api/items/${show.id}`, { soonHidden: "forever" })).status === 400);
  const epCap = (await api.call("POST", "/api/captures", { body: "Heard it here.", itemId: pod.id, detail: "Episode 12" })).data.capture;
  check("a capture keeps the episode it came from", epCap?.detail === "Episode 12");

  console.log("\nCaptures: talk about it, time, marks, images");
  const talkCap = (await api.call("POST", "/api/captures", { kind: "idea", body: "Worth a talk.", itemId: pod.id, talk: true, note: "Your note." })).data.capture;
  check("a capture can be switched to Talk about it", talkCap?.talk === true && talkCap.talkedOn === null && talkCap.talkNote === null);
  let waiting = (await api.call("GET", "/api/captures?talk=waiting")).data.captures;
  check("the API lists the ones waiting for a talk, with their item", waiting.some((c) => c.id === talkCap.id && c.item?.title === "Selftest Hour") && waiting.every((c) => c.talk));
  const talked = (await api.call("PATCH", `/api/captures/${talkCap.id}`, { talkedOn: today, talkNote: "We landed on trying it for a week." })).data.capture;
  check("after a talk it keeps the date and Claude's line, your note untouched", talked?.talkedOn === today && talked.talkNote === "We landed on trying it for a week." && talked.note === "Your note.");
  check("a talked-about capture stops waiting", talked?.talk === false && !(await api.call("GET", "/api/captures?talk=waiting")).data.captures.some((c) => c.id === talkCap.id));
  const byC = (await api.call("PATCH", `/api/captures/${talkCap.id}`, { byClaude: true })).data.capture;
  // Left tagged, so the older-file import check below proves a file without byClaude keeps it.
  check("a capture can be tagged Written by Claude", byC?.byClaude === true);
  check("a new capture isn't tagged", talkCap.byClaude === false);
  check("a bad talked-about date is refused", (await api.call("PATCH", `/api/captures/${talkCap.id}`, { talkedOn: "today" })).status === 400);

  const timed = (await api.call("POST", "/api/captures", { body: "At a time.", itemId: pod.id, detail: "Episode 3", time: "1309" })).data.capture;
  check("time 1309 is kept as 13:09, apart from the episode", timed?.time === "13:09" && timed.detail === "Episode 3");
  check("time 11309 is kept as 1:13:09", (await api.call("PATCH", `/api/captures/${timed.id}`, { time: "11309" })).data.capture?.time === "1:13:09");
  check("time 13:09 is kept as typed", (await api.call("PATCH", `/api/captures/${timed.id}`, { time: "13:09" })).data.capture?.time === "13:09");
  check("a time that can't be one is refused", (await api.call("PATCH", `/api/captures/${timed.id}`, { time: "13:75" })).status === 400);
  check("a blank time clears it", (await api.call("PATCH", `/api/captures/${timed.id}`, { time: "" })).data.capture?.time === null);

  const mark = await api.call("POST", "/api/captures", { kind: "idea", itemId: pod.id, detail: "Episode 4", time: "4500" });
  check("a mark saves with no words: podcast, episode and time", mark.status === 200 && mark.data.capture.body === "" && mark.data.capture.time === "45:00", JSON.stringify(mark.data));
  check("a capture with no words and nothing to go on is refused", (await api.call("POST", "/api/captures", { kind: "idea", body: "  " })).status === 400);
  const marks = (await api.call("GET", "/api/captures?mark=1")).data.captures;
  check("the API lists marks waiting to be finished", marks.some((c) => c.id === mark.data.capture.id) && marks.every((c) => c.body === ""));
  const finished = (await api.call("PATCH", `/api/captures/${mark.data.capture.id}`, { body: "Written up later." })).data.capture;
  check("writing a mark up finishes it", finished?.body === "Written up later." && !(await api.call("GET", "/api/captures?mark=1")).data.captures.some((c) => c.id === finished.id));
  const bare = (await api.call("POST", "/api/captures", { body: "Only words." })).data.capture;
  check("emptying a capture with nothing else on it is refused", (await api.call("PATCH", `/api/captures/${bare.id}`, { body: "" })).status === 400);
  check("and leaves it as it was", (await api.call("GET", `/api/captures/${bare.id}`)).data.capture?.body === "Only words.");

  // A real 1x1 PNG, and fake JPEGs: the server checks the first bytes, not the picture.
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(n)]).toString("base64");
  const shot = await api.call("POST", "/api/captures", { kind: "idea", image: { type: "image/png", data: PNG, width: 1, height: 1 } });
  const shotCap = shot.data.capture;
  check("a screenshot alone makes a mark with the image", shot.status === 200 && shotCap.body === "" && shotCap.image?.type === "image/png" && shotCap.image.width === 1, JSON.stringify(shot.data).slice(0, 200));
  const imgRes = await fetch(`${A.base}/api/images/${shotCap.image.id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  check("the image comes back byte for byte, as a PNG", imgRes.status === 200 && imgRes.headers.get("content-type") === "image/png" && imgBytes.equals(Buffer.from(PNG, "base64")));
  check("signed out, the image is refused", (await fetch(`${A.base}/api/images/${shotCap.image.id}`)).status === 401);
  const stateText = JSON.stringify((await api.call("GET", "/api/state")).data);
  check("the image bytes stay out of /api/state", stateText.includes(shotCap.image.id) && !stateText.includes(PNG.slice(0, 40)));
  check("an image over 1 MB is refused", (await api.call("POST", "/api/captures", { image: { type: "image/jpeg", data: jpeg(1100 * 1024) } })).status === 400);
  check("an image just under 1 MB is kept", (await api.call("POST", "/api/captures", { image: { type: "image/jpeg", data: jpeg(1000 * 1024) } })).status === 200);
  check("a file that isn't an image is refused", (await api.call("POST", "/api/captures", { image: { type: "image/jpeg", data: Buffer.from("not a picture at all").toString("base64") } })).status === 400);
  check("an SVG is refused", (await api.call("POST", "/api/captures", { image: { type: "image/svg+xml", data: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64") } })).status === 400);
  check("an image labeled as the wrong type is refused", (await api.call("POST", "/api/captures", { image: { type: "image/jpeg", data: PNG } })).status === 400);
  const swapped = (await api.call("PATCH", `/api/captures/${shotCap.id}`, { image: { type: "image/jpeg", data: jpeg(2000) } })).data.capture;
  check("replacing the image gives a new one; the old one is kept, not erased", swapped?.image?.type === "image/jpeg" && swapped.image.id !== shotCap.image.id && (await fetch(`${A.base}/api/images/${shotCap.image.id}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status === 200);
  const filled = (await api.call("PATCH", `/api/captures/${shotCap.id}`, { item: { type: "podcast", title: "selftest hour" }, detail: "Episode 9", time: "2210" })).data.capture;
  check("a mark is filled in by title through the API (as Claude does from a screenshot)", filled?.itemId === pod.id && filled.detail === "Episode 9" && filled.time === "22:10" && filled.body === "" && filled.image?.id === swapped.image.id);
  check("removing the image of a mark that still says where it's from is fine", (await api.call("PATCH", `/api/captures/${shotCap.id}`, { image: null })).data.capture?.image === null);
  const lone = (await api.call("POST", "/api/captures", { image: { type: "image/png", data: PNG } })).data.capture;
  check("removing the only thing a mark has is refused", (await api.call("PATCH", `/api/captures/${lone.id}`, { image: null })).status === 400);

  console.log("\nDelete and restore");
  const before = (await api.call("GET", "/api/state")).data;
  await api.call("DELETE", `/api/items/${mid}`);
  st = (await api.call("GET", "/api/state")).data;
  check("deleted item leaves the views, with its logs and captures", !st.items.some((i) => i.id === mid) && !st.logs.some((l) => l.itemId === mid) && !st.captures.some((c) => c.itemId === mid));
  const trash = (await api.call("GET", "/api/trash")).data;
  check("deleted item waits in Recently deleted", trash.items.some((i) => i.id === mid));
  await api.call("POST", "/api/restore", { kind: "item", id: mid });
  st = (await api.call("GET", "/api/state")).data;
  check("restore brings back the item, its logs and captures", st.items.length === before.items.length && st.logs.length === before.logs.length && st.captures.length === before.captures.length);
  const oneLog = st.logs.find((l) => l.itemId === mid);
  await api.call("DELETE", `/api/logs/${oneLog.id}`);
  const logGone = !(await api.call("GET", "/api/state")).data.logs.some((l) => l.id === oneLog.id);
  const logBack = await api.call("POST", "/api/restore", { kind: "log", id: oneLog.id });
  check("a deleted finish is restored on its own", logGone && logBack.status === 200 && (await api.call("GET", "/api/state")).data.logs.some((l) => l.id === oneLog.id));
  const oneCap = c1.data.capture;
  await api.call("DELETE", `/api/captures/${oneCap.id}`);
  const capGone = (await api.call("GET", `/api/captures/${oneCap.id}`)).status === 404;
  const capBack = await api.call("POST", "/api/restore", { kind: "capture", id: oneCap.id });
  check("a deleted capture is restored on its own", capGone && capBack.status === 200 && (await api.call("GET", `/api/captures/${oneCap.id}`)).data.capture?.body === "A line worth keeping.");
  check("restoring something that isn't deleted is refused", (await api.call("POST", "/api/restore", { kind: "capture", id: oneCap.id })).status === 404);
  check("restoring a kind that doesn't exist is refused", (await api.call("POST", "/api/restore", { kind: "image", id: oneCap.id })).status === 400);

  console.log("\nExport and import round trip");
  await api.call("DELETE", `/api/captures/${c2.data.capture.id}`); // a deleted row must survive the trip too
  const exp = (await api.call("GET", "/api/export")).data;
  const health = (await api.call("GET", "/api/health")).data;
  check("export holds every row, deleted ones included", exp.items.length === health.rows.items && exp.logs.length === health.rows.logs && exp.captures.length === health.rows.captures);
  check("export holds every image's bytes, replaced and removed ones included", exp.images.length === health.rows.images && exp.images.length >= 4 && exp.images.every((im) => typeof im.data === "string" && im.data.length > 0) && exp.images.some((im) => im.deletedAt));
  const lean = (await api.call("GET", "/api/export?images=none")).data;
  check(
    "?images=none lists every image without its bytes and leaves the rest of the export as it is",
    lean.images.length === exp.images.length && lean.images.every((im) => !("data" in im) && im.bytes > 0) && JSON.stringify(lean.items) === JSON.stringify(exp.items) && JSON.stringify(lean.captures) === JSON.stringify(exp.captures)
  );
  B = await start(3998, { ...common(2), SEED_FILE: "none" });
  const apiB = client(B.base);
  const emptyB = (await apiB.call("GET", "/api/health")).data.rows;
  check("second copy starts empty", emptyB.items === 0 && emptyB.logs === 0 && emptyB.captures === 0);
  const imp = await apiB.call("POST", "/api/import", exp);
  check("import into the empty copy", imp.status === 200, JSON.stringify(imp.data));
  const expB = (await apiB.call("GET", "/api/export")).data;
  // airInfo is a cache of TVmaze's answer: an import never carries it, and each copy asks again in its own time.
  const strip = (f) => ({ items: sortById(f.items).map((i) => ({ ...i, airInfo: null })), logs: sortById(f.logs), captures: sortById(f.captures), images: sortById(f.images ?? []) });
  console.log(`        counts  A: ${exp.items.length}/${exp.logs.length}/${exp.captures.length}/${exp.images.length}   B: ${expB.items.length}/${expB.logs.length}/${expB.captures.length}/${expB.images.length}  (items/logs/captures/images)`);
  check("counts match after the round trip", expB.items.length === exp.items.length && expB.logs.length === exp.logs.length && expB.captures.length === exp.captures.length && expB.images.length === exp.images.length);
  check("every field matches after the round trip", JSON.stringify(strip(expB)) === JSON.stringify(strip(exp)));
  const again2 = await api.call("POST", "/api/import", exp);
  check("re-importing the same file adds nothing", again2.data.after.items === again2.data.before.items && again2.data.after.logs === again2.data.before.logs);
  // A file from before services, statuses, seasons, Not a Fan, hidden seasons, capture details, times, talks and images
  // existed must not wipe them.
  const { images: _images, ...expNoImages } = exp;
  const legacy = {
    ...expNoImages,
    items: exp.items.map(({ watchOn, status, seasonsSeen, disliked, soonHidden, releaseOn, sortPos, ...rest }) => rest),
    captures: exp.captures.map(({ detail, time, talk, talkedOn, talkNote, byClaude, image, ...rest }) => rest),
  };
  const legacyImp = await api.call("POST", "/api/import", legacy);
  const afterLegacy = (await api.call("GET", "/api/export")).data;
  check(
    "an older file without the newer fields keeps them",
    legacyImp.status === 200 && JSON.stringify(strip(afterLegacy)) === JSON.stringify(strip(exp)) && afterLegacy.items.some((i) => i.status === "paused" && i.title === "Selftest Hour")
  );
  check("Not a Fan and a hidden season survive an older file too", afterLegacy.items.some((i) => i.id === show.id && i.disliked === true && i.soonHidden === "s2"));
  // Importing an older file to recover something must not roll back what changed since.
  await api.call("PATCH", `/api/items/${pod.id}`, { progress: "Changed after the export" });
  const goneLog = exp.logs.find((l) => !l.deletedAt);
  await api.call("DELETE", `/api/logs/${goneLog.id}`);
  const oldImp = await api.call("POST", "/api/import", exp);
  const afterOld = (await api.call("GET", "/api/export")).data;
  check(
    "an older file keeps an edit made since, and says so",
    oldImp.status === 200 && afterOld.items.find((i) => i.id === pod.id)?.progress === "Changed after the export" && oldImp.data.kept.items >= 1,
    JSON.stringify(oldImp.data)
  );
  check("an older file doesn't bring back a finish deleted since", afterOld.logs.find((l) => l.id === goneLog.id)?.deletedAt != null && oldImp.data.kept.logs >= 1);
  const newer = { ...exp, items: exp.items.map((i) => (i.id === pod.id ? { ...i, progress: "From a newer file", updatedAt: new Date(Date.now() + 60_000).toISOString() } : i)) };
  await api.call("POST", "/api/import", newer);
  const lastChangeA = Date.now(); // nothing below changes the first copy until its backup has been checked
  check("a newer file's version still wins", (await api.call("GET", "/api/export")).data.items.find((i) => i.id === pod.id)?.progress === "From a newer file");
  const broken = await apiB.call("POST", "/api/import", { ...exp, logs: [...exp.logs, { id: "x", itemId: "missing", finishedOn: "2026-13-99" }] });
  const afterBroken = (await apiB.call("GET", "/api/health")).data.rows;
  check("a bad file changes nothing", broken.status === 400 && afterBroken.logs === exp.logs.length);
  const badImage = await apiB.call("POST", "/api/import", { ...exp, images: [...exp.images, { id: "bad-img", captureId: exp.captures[0].id, type: "image/png", data: "bm90IGFuIGltYWdl" }] });
  check("a file with a broken image changes nothing", badImage.status === 400 && (await apiB.call("GET", "/api/health")).data.rows.images === exp.images.length);
  // Links are rendered as links, so a file gets the same check as the forms.
  const badLink = await apiB.call("POST", "/api/import", { ...exp, captures: exp.captures.map((x, k) => (k === 0 ? { ...x, url: "javascript:alert(1)" } : x)) });
  check("a file with an unsafe link changes nothing", badLink.status === 400);
  const badCover = await apiB.call("POST", "/api/import", { ...exp, items: exp.items.map((x, k) => (k === 0 ? { ...x, coverUrl: "javascript:alert(1)" } : x)) });
  check("a file with an unsafe cover link changes nothing", badCover.status === 400);
  check("a movie's release date survives the round trip", expB.items.find((i) => i.id === mid)?.releaseOn === "2031-05-02");
  // Images make export files big. One past the 10 MB a request body used to be cut at must still import whole.
  const bigCap = exp.captures.find((c) => !c.deletedAt);
  const bigImages = Array.from({ length: 12 }, (_, n) => ({
    id: `big-${n}`, captureId: bigCap.id, type: "image/jpeg", bytes: 0, width: null, height: null,
    data: jpeg(950 * 1024), createdAt: new Date(Date.now() - n * 1000).toISOString(), deletedAt: n ? new Date().toISOString() : null,
  }));
  const bigFile = { ...exp, images: [...exp.images, ...bigImages] };
  const bigSize = JSON.stringify(bigFile).length;
  const bigImp = await apiB.call("POST", "/api/import", bigFile);
  const afterBig = (await apiB.call("GET", "/api/export")).data;
  check(
    `a ${Math.round(bigSize / 1024 / 1024)} MB import file imports whole`,
    bigSize > 10 * 1024 * 1024 && bigImp.status === 200 && afterBig.images.length === exp.images.length + 12 && afterBig.captures.find((c) => c.id === bigCap.id)?.image?.id === "big-0",
    JSON.stringify(bigImp.data).slice(0, 200)
  );

  console.log("\nSurvives a restart");
  const dayName = (d) => `media-log-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
  // A backup is written a few seconds after the last change. Wait for today's file to be one made since
  // then (it is written whole, then renamed into place), instead of for a fixed time.
  const backupSince = async (dir, since, ms = 20000) => {
    for (let t = 0; t < ms; t += 200) {
      try {
        if (Date.parse(JSON.parse(fs.readFileSync(path.join(dir, dayName(new Date())), "utf8")).exportedAt) >= since) return true;
      } catch {
        /* not there yet */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  };
  await backupSince(path.join(TMP, "backups1"), lastChangeA);
  const backups = fs.existsSync(path.join(TMP, "backups1")) ? fs.readdirSync(path.join(TMP, "backups1")) : [];
  check("a local backup file was written", backups.some((f) => /^media-log-\d{4}-\d{2}-\d{2}\.json$/.test(f)));

  console.log("\nBackups: images kept once, fewer days, restore");
  const bdir = path.join(TMP, "backups1");
  const todayName = dayName(new Date());
  const daily = JSON.parse(fs.readFileSync(path.join(bdir, todayName), "utf8"));
  const liveExp = (await api.call("GET", "/api/export")).data;
  check("the daily backup names each image instead of carrying its bytes", daily.images.length === liveExp.images.length && daily.images.every((im) => !im.data && /^images\//.test(im.file)));
  const liveById = new Map(liveExp.images.map((im) => [im.id, im]));
  check(
    "each image sits in the backup folder once, byte for byte",
    daily.images.every((im) => fs.readFileSync(path.join(bdir, im.file)).equals(Buffer.from(liveById.get(im.id).data, "base64"))) &&
      fs.readdirSync(path.join(bdir, "images")).length === liveExp.images.length
  );
  // Restore into an empty copy from the daily file plus its images folder (its own backups off, so it can't overwrite them).
  const rdir = path.join(TMP, "backups4");
  fs.mkdirSync(rdir);
  fs.copyFileSync(path.join(bdir, todayName), path.join(rdir, todayName));
  fs.cpSync(path.join(bdir, "images"), path.join(rdir, "images"), { recursive: true });
  D = await start(3996, { ...common(4), SEED_FILE: "none", BACKUP_DIR: rdir, LOCAL_BACKUPS: "off" });
  const apiD = client(D.base);
  const gone = path.join(rdir, daily.images[0].file);
  fs.renameSync(gone, gone + ".away");
  const noImg = await apiD.call("POST", "/api/import", daily);
  check(
    "a daily backup whose image file is missing changes nothing, and says which",
    noImg.status === 400 && String(noImg.data.error).includes(path.basename(gone)) && (await apiD.call("GET", "/api/health")).data.rows.items === 0,
    JSON.stringify(noImg.data)
  );
  fs.renameSync(gone + ".away", gone);
  const restored = await apiD.call("POST", "/api/import", daily);
  const expD = (await apiD.call("GET", "/api/export")).data;
  check("Import of a daily backup restores everything, images from the folder byte for byte", restored.status === 200 && JSON.stringify(strip(expD)) === JSON.stringify(strip(liveExp)), JSON.stringify(restored.data).slice(0, 200));
  await stop(D);
  D = null;
  // 14 newest days, then one a week for 8 weeks: fill 120 days of old files, make a change, see what's left.
  for (let n = 1; n <= 120; n++) fs.writeFileSync(path.join(bdir, dayName(new Date(Date.now() - n * 86_400_000))), "{}");
  await api.call("PATCH", `/api/captures/${bare.id}`, { note: "Prompts a backup." });
  await backupSince(bdir, Date.now());
  const dailyFiles = () => fs.readdirSync(bdir).filter((f) => /^media-log-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  // Older files are removed right after today's is written: give that a moment rather than race it.
  for (let t = 0; t < 3000 && dailyFiles().length > 22; t += 100) await new Promise((r) => setTimeout(r, 100));
  const kept = dailyFiles();
  const ageDays = (f) => Math.round((Date.parse(todayName.slice(10, 20)) - Date.parse(f.slice(10, 20))) / 86_400_000);
  const older = kept.slice(14);
  const mondays = new Set(older.map((f) => { const t = Date.parse(f.slice(10, 20)); return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10); }));
  check(
    `backups keep the newest 14 days, then one a week for 8 weeks (${kept.length} files, oldest ${ageDays(kept.at(-1))} days back)`,
    kept.length === 22 && kept.slice(0, 14).every((f, i) => ageDays(f) === i) && older.length === 8 && mondays.size === 8 && ageDays(kept.at(-1)) <= 14 + 9 * 7
  );
  check("the images folder is kept whole while daily files go", fs.readdirSync(path.join(bdir, "images")).length === liveExp.images.length);

  console.log("\nHosted backups: npm run backup:pull against a running copy");
  const pdir = path.join(TMP, "pulled");
  // Run from the temp folder, so a real .env.local in this checkout (its address, token or alert command) is never read.
  const pull = (env = {}) =>
    spawnSync(process.execPath, [path.join(ROOT, "scripts", "backup-pull.mjs")], {
      cwd: TMP,
      env: { ...process.env, MEDIA_LOG_URL: A.base, MEDIA_LOG_TOKEN: TOKEN, MEDIA_LOG_BACKUP_DIR: pdir, BACKUP_NOTIFY: "off", BACKUP_ALERT_CMD: "", ...env },
      encoding: "utf8",
    });
  const hostedName = dayName(new Date()).replace("media-log-", "media-log-hosted-");
  const badPull = pull({ MEDIA_LOG_TOKEN: "not-the-token-not-the-token" });
  check("with the wrong token it fails with a non-zero exit and saves nothing", badPull.status !== 0 && !fs.existsSync(path.join(pdir, hostedName)), `exit ${badPull.status} ${badPull.stderr}`);
  const pulled = pull();
  const liveNow = (await api.call("GET", "/api/export")).data;
  const hosted = fs.existsSync(path.join(pdir, hostedName)) ? JSON.parse(fs.readFileSync(path.join(pdir, hostedName), "utf8")) : null;
  check(
    "it saves today's file with every row, naming each image instead of carrying its bytes",
    pulled.status === 0 && !!hosted && hosted.items.length === liveNow.items.length && hosted.logs.length === liveNow.logs.length && hosted.captures.length === liveNow.captures.length &&
      hosted.images.length === liveNow.images.length && hosted.images.every((im) => !im.data && /^images\//.test(im.file)),
    `exit ${pulled.status} ${pulled.stderr}`
  );
  const nowById = new Map(liveNow.images.map((im) => [im.id, im]));
  check(
    "each image is fetched once into its images folder, byte for byte",
    !!hosted && hosted.images.every((im) => fs.readFileSync(path.join(pdir, im.file)).equals(Buffer.from(nowById.get(im.id).data, "base64"))) && fs.readdirSync(path.join(pdir, "images")).length === liveNow.images.length
  );
  D = await start(3996, { ...common(9), SEED_FILE: "none", BACKUP_DIR: pdir, LOCAL_BACKUPS: "off" });
  const apiP = client(D.base);
  const backP = await apiP.call("POST", "/api/import", hosted);
  check("Import of a pulled backup restores everything, images from its folder", backP.status === 200 && JSON.stringify(strip((await apiP.call("GET", "/api/export")).data)) === JSON.stringify(strip(liveNow)), JSON.stringify(backP.data).slice(0, 200));
  await stop(D);
  D = null;
  for (let n = 1; n <= 120; n++) fs.writeFileSync(path.join(pdir, dayName(new Date(Date.now() - n * 86_400_000)).replace("media-log-", "media-log-hosted-")), "{}");
  const pulledAgain = pull();
  const keptHosted = fs.readdirSync(pdir).filter((f) => /^media-log-hosted-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  check(
    `pulled backups are kept like the local ones: the newest 14 days, then one a week for 8 weeks (${keptHosted.length} files)`,
    pulledAgain.status === 0 && keptHosted.length === 22 && keptHosted[0] === hostedName && fs.readdirSync(path.join(pdir, "images")).length === liveNow.images.length,
    `exit ${pulledAgain.status} ${pulledAgain.stderr}`
  );
  const preRestart = (await api.call("GET", "/api/export")).data;
  await stop(A);
  A = await start(3999, common(1));
  const postRestart = (await client(A.base).call("GET", "/api/export")).data;
  check("every row is still there after the server stops and starts", JSON.stringify(strip(postRestart)) === JSON.stringify(strip(preRestart)));

  console.log("\nFirst run: no seed file means an empty library; the demo loads only when asked");
  // SEED_FILE unset (an empty value reads as unset). A personal seed in this checkout would load instead,
  // which is the documented order, so that case is checked as itself and the rest runs on SEED_FILE=none.
  const personalSeed = fs.existsSync(path.join(ROOT, "data", "seed.personal.json"));
  D = await start(3996, { ...common(6), SEED_FILE: "" });
  let apiE = client(D.base);
  const seedE = (await apiE.call("GET", "/api/health")).data;
  check(
    `with no SEED_FILE the demo no longer loads by itself (seeded from: ${seedE.seed})`,
    seedE.seed === (personalSeed ? "seed.personal.json" : "none") && (personalSeed || seedE.rows.items === 0)
  );
  if (personalSeed) {
    console.log("  (data/seed.personal.json is here, so the empty-library checks run on SEED_FILE=none)");
    await stop(D);
    D = await start(3996, { ...common(7), SEED_FILE: "none" });
    apiE = client(D.base);
  }
  const stE = (await apiE.call("GET", "/api/state")).data;
  check("a fresh database with no seed starts empty", stE.items.length === 0 && stE.logs.length === 0 && stE.captures.length === 0);
  const homeE = client(D.base, "none");
  await homeE.call("POST", "/api/login", { password: PASSWORD });
  const pageE = String((await homeE.call("GET", "/")).data);
  check("the empty library's Now is the welcome, with its three first steps and the demo link",
    ["Your library is empty.", "Add a show", "Queue something", "Capture a line", "Or load a small demo library to look around", "These are examples. Your first add replaces them."].every((t) => pageE.includes(t)));
  const exampleTitles = [...fs.readFileSync(path.join(ROOT, "lib", "examples.ts"), "utf8").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  check(`the example list is one plain file of titles, with no image files or links (${exampleTitles.length} titles)`,
    exampleTitles.length >= 8 && !/https?:|\.(jpe?g|png|webp|gif|svg)\b/i.test(fs.readFileSync(path.join(ROOT, "lib", "examples.ts"), "utf8")));
  // The ghost shelf asks the lookup for each example; a lookup never saves anything.
  for (const t of exampleTitles.slice(0, 3)) await apiE.call("GET", `/api/lookup?type=tv&q=${encodeURIComponent(t)}`);
  const afterLook = (await apiE.call("GET", "/api/health")).data.rows;
  check("looking up the examples saves nothing", afterLook.items === 0 && afterLook.captures === 0);
  const demoFile = JSON.parse(fs.readFileSync(path.join(ROOT, "seed", "demo.json"), "utf8"));
  const demoLive = demoFile.items.filter((i) => !i.deletedAt).length;
  const loaded = await apiE.call("POST", "/api/demo", {});
  const stDemo = (await apiE.call("GET", "/api/state")).data;
  check(`loading the demo fills the empty library (${stDemo.items.length} items)`, loaded.status === 200 && stDemo.items.length === demoLive && stDemo.logs.length > 0 && stDemo.captures.length > 0, JSON.stringify(loaded.data).slice(0, 200));
  check("demo rows are ordinary items with ids of their own", stDemo.items.every((i) => !demoFile.items.some((d) => d.id === i.id)) && stDemo.logs.every((l) => stDemo.items.some((i) => i.id === l.itemId)));
  const demoAgain = await apiE.call("POST", "/api/demo", {});
  check("the demo is refused once the library has anything in it", demoAgain.status === 400 && String(demoAgain.data.error).includes("already has things") && (await apiE.call("GET", "/api/state")).data.items.length === demoLive, JSON.stringify(demoAgain.data));
  const expE = JSON.stringify((await apiE.call("GET", "/api/export")).data) + JSON.stringify(stDemo);
  check("example titles never appear in state or an export", exampleTitles.every((t) => !expE.includes(`"${t}"`)));
  for (const i of stDemo.items) await apiE.call("DELETE", `/api/items/${i.id}`);
  const reload = await apiE.call("POST", "/api/demo", {});
  const stDemo2 = (await apiE.call("GET", "/api/state")).data;
  check("a demo that was loaded and deleted can be loaded again (deletes are soft, and stay)", reload.status === 200 && stDemo2.items.length === demoLive && (await apiE.call("GET", "/api/health")).data.rows.items === demoFile.items.length * 2);
  const fullBefore = (await api.call("GET", "/api/health")).data.rows;
  const refusedA = await api.call("POST", "/api/demo", {});
  check("a library with things in it refuses the demo and is left as it was", refusedA.status === 400 && JSON.stringify((await api.call("GET", "/api/health")).data.rows) === JSON.stringify(fullBefore));
  check("the demo route needs a session like the rest", (await client(A.base, "none").call("POST", "/api/demo", {})).status === 401);
  const loginA = String((await client(A.base, "none").call("GET", "/login")).data);
  check("a local copy's sign-in page says the password is in .env.local, without showing it", loginA.includes("The password is in .env.local") && !loginA.includes(PASSWORD));
  await stop(D);
  D = null;

  console.log("\nFails closed without a password");
  await stop(B);
  B = null;
  C = await start(3997, { ...common(3), APP_PASSWORD: "", API_TOKEN: "" });
  check("API answers 503 when no password is set", (await client(C.base, "none").call("GET", "/api/state")).status === 503);
  check("sign-in is impossible with no password set", (await client(C.base, "none").call("POST", "/api/login", { password: "" })).status === 503);

  console.log("\nFails closed on a serverless host with no database");
  await stop(C);
  C = await start(3997, { ...common(5), VERCEL: "1" });
  const noDb = await client(C.base).call("GET", "/api/state");
  check("API answers 503 saying DATABASE_URL is needed", noDb.status === 503 && String(noDb.data?.error).includes("DATABASE_URL"));
  check("pages send you to the sign-in page", [302, 307, 308].includes((await client(C.base, "none").call("GET", "/")).status));
  const noDbPage = await client(C.base, "none").call("GET", "/login");
  check("the sign-in page explains, with no sign-in form", String(noDbPage.data).includes("DATABASE_URL") && !String(noDbPage.data).includes('name="password"'));
  check("no database files were made", !fs.existsSync(dbDir(5)));

  console.log("\nSign-in page on a hosted database");
  await stop(C);
  // The sign-in page never opens the database, so an address nothing answers on is enough to stand in for a hosted one.
  C = await start(3997, { ...common(8), DATABASE_URL: "postgres://nobody@127.0.0.1:9/none" });
  const hostedLogin = String((await client(C.base, "none").call("GET", "/login")).data);
  check("a hosted copy's sign-in page has the form and no line about .env.local", hostedLogin.includes('name="password"') && !hostedLogin.includes(".env.local"));
} catch (e) {
  failures.push("crashed: " + (e instanceof Error ? e.message : String(e)));
  console.error(e);
} finally {
  for (const s of [A, B, C, D]) if (s) await stop(s);
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    console.log(`(could not remove ${TMP}; delete it by hand)`);
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("Failed: " + failures.join("; "));
  process.exit(1);
}
