// Finding a cover for something that has none: the same lookups the add sheet uses, read strictly.
// A match must have the same title; an author, artist, director or year that disagrees rules it out.
// "sure" means a second thing agreed too (the creator, or the year within one). Only sure matches are
// ever saved without you looking (fillCover, after something is added with no cover, and retryCovers,
// when a lookup site didn't answer the first time); the Missing covers review shows the rest for you
// to tick or not.

import { after } from "next/server";
import type { MediaType } from "./config";
import { getDb } from "./db";
import { bare, lookup, lookupAppleBooks, readFixture, words } from "./lookup";
import { scheduleBackup } from "./backup";
import type { LookupResult } from "./types";

export type CoverPick = {
  coverUrl: string;
  /** Where it came from (openlibrary, applebooks, itunes, tvmaze, tmdb, wikipedia) and its id there. */
  source: string;
  sourceId: string;
  /** What the source calls it, so you can see what was matched. */
  title: string;
  creator: string | null;
  year: number | null;
  /** The creator or the year agreed as well as the title. */
  sure: boolean;
};

type Want = { type: MediaType; title: string; creator: string | null; year: number | null };

// Books and albums often carry a subtitle or edition the entry leaves off ("Piranesi: A Novel",
// "Folklore (Deluxe Version)"). Shows and films don't get that slack: "Dune: Part Two" is not "Dune".
const SUBTITLE_TYPES: readonly MediaType[] = ["book", "music", "podcast"];
const stripSub = (s: string) => s.replace(/\s*[:(\[].*$/, "");

function titleMatches(type: MediaType, found: string, want: string): boolean {
  const w = bare(want);
  if (!w) return false;
  if (bare(found) === w) return true;
  return SUBTITLE_TYPES.includes(type) && bare(stripSub(found)) === w;
}

/** Shows keep their network in creator, which names vary too much to compare ("Apple TV", "Apple TV+"). */
const compareCreator = (type: MediaType) => type !== "tv";

function judge(want: Want, r: LookupResult): { ok: boolean; sure: boolean } {
  if (!r.coverUrl || !titleMatches(want.type, r.title, want.title)) return { ok: false, sure: false };
  let sure = false;
  if (compareCreator(want.type) && want.creator && r.creator) {
    const a = new Set(words(want.creator));
    const shared = words(r.creator).some((x) => a.has(x));
    if (!shared) return { ok: false, sure: false };
    sure = true;
  }
  if (want.year && r.year) {
    const near = Math.abs(want.year - r.year) <= 1;
    // A book's year is often one edition's and the source's another, so a gap doesn't rule a book out.
    if (!near && want.type !== "book") return { ok: false, sure: false };
    if (near) sure = true;
  }
  return { ok: true, sure };
}

// Shows and podcasts rarely carry a creator or year here, so for them one result with exactly that title
// (and nothing else sharing it) is as good as a second agreement. TVmaze and Apple's podcast list are
// near-complete; book and film searches aren't, so they never get this.
const UNIQUE_IS_SURE: readonly MediaType[] = ["tv", "podcast"];

function best(want: Want, results: LookupResult[]): CoverPick | null {
  let first: CoverPick | null = null;
  const exact = results.filter((r) => bare(r.title) === bare(want.title));
  const unique = UNIQUE_IS_SURE.includes(want.type) && exact.length === 1 ? exact[0] : null;
  for (const r of results) {
    const j = judge(want, r);
    if (!j.ok) continue;
    if (r === unique) j.sure = true;
    const pick: CoverPick = { coverUrl: r.coverUrl!, source: r.source, sourceId: r.sourceId, title: r.title, creator: r.creator, year: r.year, sure: j.sure };
    if (j.sure) return pick;
    first ??= pick;
  }
  return first;
}

/**
 * The best cover for it, or null. failed says a source didn't answer (down, or limiting requests), so a null
 * then means "couldn't check" rather than "no match". unanswered says a source didn't answer whether or not
 * something was found, so a pick that isn't sure may only be missing the source that would have settled it.
 * Nothing here throws for the network.
 */
export async function findCover(want: Want): Promise<{ pick: CoverPick | null; failed: boolean; unanswered: boolean }> {
  let unanswered = false;
  const search = async (type: MediaType, q: string) => {
    const r = await lookup(type, q);
    if (r.error) unanswered = true;
    return best(want, r.results);
  };
  // Albums are searched with the artist, since album titles repeat ("Greatest Hits").
  let main = await search(want.type, want.type === "music" && want.creator ? `${want.title} ${want.creator}` : want.title);
  // A remake shares its title: the year narrows the film search ("Dune 1984").
  if (want.type === "movie" && want.year && !main?.sure) {
    const again = await search("movie", `${want.title} ${want.year}`);
    if (again?.sure || !main) main = again;
  }
  if (main?.sure || want.type !== "book") return { pick: main, failed: unanswered && !main, unanswered };
  // Books get a second source: Apple Books, searched with the author.
  const a = await lookupAppleBooks(want.creator ? `${want.title} ${want.creator}` : want.title);
  if (a.error) unanswered = true;
  const apple = best(want, a.results);
  const pick = apple?.sure ? apple : (main ?? apple);
  return { pick, failed: unanswered && !pick, unanswered };
}

// ---------- filling a cover in after an add, and trying again when a site didn't answer ----------
// The lookup sites refuse bursts (Apple's search above all), so adding several things at once could
// leave some without a cover for no better reason than timing. Two things deal with that: lookups made
// on the app's own initiative run one at a time with a pause between them, and one that got no answer
// is saved on the item to be tried again later (cover_retry_at, cover_tries), a few times, further
// apart each time. After the last try it is left for the Missing covers review in Settings.

/** How long after the first, second, third and fourth miss the next try is due. Then no more. */
const RETRY_AFTER_MINUTES = [2, 10, 60, 6 * 60];
/** The pause between two lookups made here. */
const GAP_MS = 1000;
/** At most this many retries in one run; the rest wait for the next. */
const PER_RUN = 10;

/**
 * Tests only: the LOOKUP_FIXTURE file may set "coverRetryMs", how long after a miss the next try is
 * due, so a test doesn't wait minutes. Canned lookups reach no site, so they aren't paced either.
 */
async function pacing(): Promise<{ gapMs: number; retryMs: (misses: number) => number | null }> {
  const fx = await readFixture();
  const fixed = typeof fx?.coverRetryMs === "number" ? fx.coverRetryMs : null;
  return {
    gapMs: fx ? 0 : GAP_MS,
    retryMs: (misses) => (misses >= RETRY_AFTER_MINUTES.length ? null : (fixed ?? RETRY_AFTER_MINUTES[misses] * 60_000)),
  };
}

/** Lookups made here wait their turn: one at a time, with the pause after each. */
let line: Promise<unknown> = Promise.resolve();
function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  const mine = line.then(fn);
  line = mine
    .catch(() => undefined)
    .then(async () => {
      const { gapMs } = await pacing();
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
    });
  return mine;
}

/**
 * One try at a cover for an item that has none. Saves it only if the match is sure, and only if no
 * cover arrived in the meantime; a show also gets its TVmaze id when it has none, which is what Coming
 * soon reads its air dates from. With no sure match and a site that didn't answer, the item is marked
 * to be tried again. False means a site didn't answer.
 */
async function tryCover(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.query<{ type: MediaType; title: string; creator: string | null; year: number | null; cover_tries: number; cover_retry_at: unknown }>(
    `select type, title, creator, year, cover_tries, cover_retry_at from items where id = $1 and cover_url is null and entity = 'work' and deleted_at is null`,
    [id],
  );
  const it = rows[0];
  if (!it) return true;
  const { pick, unanswered } = await findCover({ type: it.type, title: it.title, creator: it.creator, year: it.year == null ? null : Number(it.year) });
  if (pick?.sure) {
    const saved = await db.query(
      `update items set cover_url = $2,
         lookup_source = coalesce(lookup_source, $3), lookup_id = case when lookup_source is null then $4 else lookup_id end,
         cover_retry_at = null, updated_at = now()
       where id = $1 and cover_url is null and deleted_at is null returning id`,
      [id, pick.coverUrl, pick.source, pick.sourceId],
    );
    if (saved.length) scheduleBackup();
    return true;
  }
  // No sure match. If every site answered there is nothing to wait for; if one didn't, that may be why.
  // Either way this is not a change you made: updated_at and backups are left alone.
  const misses = Number(it.cover_tries ?? 0);
  const wait = unanswered ? (await pacing()).retryMs(misses) : null;
  if (unanswered || it.cover_retry_at != null) {
    await db.query(`update items set cover_retry_at = $2, cover_tries = $3 where id = $1`, [
      id,
      wait == null ? null : new Date(Date.now() + wait).toISOString(),
      unanswered ? misses + 1 : misses,
    ]);
  }
  return !unanswered;
}

let retrying: Promise<void> | null = null;

/**
 * Tries again the covers whose lookup got no answer and whose next try is due, oldest first. Safe to
 * call often (it runs after a page load, a state read and an add): one run at a time, and a run stops
 * at the first site that still doesn't answer, leaving the rest for the next. Errors are logged, never thrown.
 */
export function retryCovers(): Promise<void> {
  if (process.env.COVER_FILL === "off") return Promise.resolve();
  retrying ??= (async () => {
    const db = await getDb();
    const due = await db.query<{ id: string }>(
      `select id from items
       where cover_retry_at <= now() and cover_url is null and entity = 'work' and deleted_at is null
       order by cover_retry_at limit ${PER_RUN}`,
    );
    for (const r of due) if (!(await inTurn(() => tryCover(r.id)))) break;
  })()
    .catch((e) => console.warn("[covers]", e instanceof Error ? e.message : e))
    .finally(() => {
      retrying = null;
    });
  return retrying;
}

/** Called by a route that just added an item: if it came with no cover (a typed title, a script), one is looked up once the answer is sent. */
export function fillCoverLater(item: { id: string; coverUrl: string | null; entity: "work" | "creator" }) {
  if (!item.coverUrl && item.entity === "work") after(() => fillCover(item.id));
}

/**
 * After something is added with no cover: look one up (see tryCover), then try any earlier ones that
 * are due. Errors are logged, never thrown: the add already succeeded.
 */
export async function fillCover(id: string): Promise<void> {
  if (process.env.COVER_FILL === "off") return;
  try {
    await inTurn(() => tryCover(id));
  } catch (e) {
    console.warn("[covers]", e instanceof Error ? e.message : e);
  }
  await retryCovers();
}
