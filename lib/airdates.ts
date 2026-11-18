// Next air dates for shows, from TVmaze. Runs on the server only. Dates are cached on each
// item (air_info) and refreshed about twice a day, so pages never wait on TVmaze; a refresh
// runs in the background after a page load or a state read (lib/background.ts). Ended shows are rechecked weekly. A failure
// keeps the old dates and is retried later: Coming Soon never shows a date TVmaze didn't give.

import { getDb } from "./db";
import { readFixture, UA } from "./lookup";
import type { AirInfo } from "./types";

const TIMEOUT_MS = 8000;
const FRESH_HOURS = 12;
const ENDED_FRESH_HOURS = 24 * 7;
/** At most this many shows per run, spaced out, to stay well inside TVmaze's rate limit. */
const PER_RUN = 80;
const GAP_MS = 400;
/** After a run, don't start another for this long, even if some shows are still stale. */
const COOLDOWN_MS = 10 * 60 * 1000;

let running: Promise<number> | null = null;
let lastRun = 0;
/** The last run stopped early (the cap, or network trouble): everything waits out the cooldown, new shows too. */
let cutShort = false;

type TvmazeShow = {
  status?: string;
  _embedded?: {
    nextepisode?: { season?: number; number?: number | null; airdate?: string };
    seasons?: Array<{ number?: number; premiereDate?: string | null; endDate?: string | null; episodeOrder?: number | null }>;
  };
};

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * In tests (LOOKUP_FIXTURE, see lib/lookup.ts) the file's "airdates" map of TVmaze id to a canned show answers
 * instead of the site, so a test server never reaches TVmaze. An id it lacks reads as a show TVmaze doesn't have.
 */
async function fixtureShow(id: string): Promise<TvmazeShow | null> {
  const fixture = await readFixture();
  if (!fixture) return null;
  const all = (fixture.airdates as Record<string, TvmazeShow> | undefined) ?? {};
  if (!all[id]) throw new Error("404 from the fixture");
  return all[id];
}

async function fetchShow(id: string): Promise<AirInfo> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let s = await fixtureShow(id);
    if (!s) {
      const res = await fetch(`https://api.tvmaze.com/shows/${encodeURIComponent(id)}?embed[]=nextepisode&embed[]=seasons`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`${res.status} from TVmaze`);
      s = (await res.json()) as TvmazeShow;
    }
    const ne = s._embedded?.nextepisode;
    const next = ne && isDay(ne.airdate) && typeof ne.season === "number" ? { season: ne.season, episode: ne.number ?? null, date: ne.airdate } : null;
    const sn = next ? s._embedded?.seasons?.find((x) => x.number === next.season) : undefined;
    return {
      checkedAt: new Date().toISOString(),
      status: s.status ?? null,
      next,
      season: sn && typeof sn.number === "number"
        ? { number: sn.number, premiere: isDay(sn.premiereDate) ? sn.premiereDate : null, end: isDay(sn.endDate) ? sn.endDate : null, episodes: sn.episodeOrder ?? null }
        : null,
      premieres: (s._embedded?.seasons ?? [])
        .filter((x) => typeof x.number === "number" && isDay(x.premiereDate))
        .map((x) => ({ season: x.number!, date: x.premiereDate! })),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Refreshes stale shows: TV with a TVmaze match, not deleted, not marked disliked.
 * Returns how many were updated. Safe to call often: one run at a time, with a cooldown.
 * A show that has never been checked doesn't wait for the cooldown (one small query finds out),
 * so something added just after a run gets its dates on the next page load. Such a run checks
 * only the new shows; ordinary staleness, and anything left by a run that hit the cap or lost
 * the network, still waits.
 */
export function refreshAirDates(): Promise<number> {
  if (process.env.AIR_DATES === "off") return Promise.resolve(0);
  if (running) return running;
  const cooling = Date.now() - lastRun < COOLDOWN_MS;
  if (cooling && cutShort) return Promise.resolve(0);
  let ran = false;
  let short = false;
  running = (async () => {
    const db = await getDb();
    const eligible = `type = 'tv' and lookup_source = 'tvmaze' and lookup_id is not null and deleted_at is null and not disliked`;
    if (cooling) {
      const fresh = await db.query(`select 1 from items where ${eligible} and air_checked_at is null limit 1`);
      if (!fresh.length) return 0;
    }
    ran = true;
    const rows = await db.query<{ id: string; lookup_id: string; air_info: unknown; air_checked_at: unknown }>(
      `select id, lookup_id, air_info, air_checked_at from items
       where ${eligible}${cooling ? " and air_checked_at is null" : ""}
       order by air_checked_at nulls first`
    );
    const now = Date.now();
    const stale = rows.filter((r) => {
      if (r.air_checked_at == null) return true;
      const info = (typeof r.air_info === "string" ? JSON.parse(r.air_info) : r.air_info) as AirInfo | null;
      // A cache from before premieres were kept is refreshed once, so "seen every season" can be told.
      if (info && !info.premieres) return true;
      const hours = info?.status === "Ended" ? ENDED_FRESH_HOURS : FRESH_HOURS;
      return now - new Date(r.air_checked_at as string | Date).getTime() > hours * 3600_000;
    });
    let done = 0;
    short = stale.length > PER_RUN;
    for (const r of stale.slice(0, PER_RUN)) {
      try {
        let info: AirInfo;
        try {
          info = await fetchShow(r.lookup_id);
        } catch (e) {
          // A show TVmaze no longer has: record that it has no dates, so it doesn't block the rest.
          if (!(e instanceof Error && e.message.startsWith("404"))) throw e;
          info = { checkedAt: new Date().toISOString(), status: null, next: null, season: null, premieres: [] };
        }
        // Not a change you made: updated_at and backups are left alone.
        await db.query(`update items set air_info = $1::jsonb, air_checked_at = now() where id = $2`, [JSON.stringify(info), r.id]);
        done++;
      } catch (e) {
        // Network trouble: stop this run and keep every cached date as it was.
        console.warn("[airdates]", e instanceof Error ? e.message : e);
        short = true;
        break;
      }
      await new Promise((ok) => setTimeout(ok, GAP_MS));
    }
    return done;
  })().finally(() => {
    running = null;
    // A look that found nothing new leaves the clock alone, or page loads would hold the cooldown open for good.
    if (!ran) return;
    lastRun = Date.now();
    cutShort = short;
  });
  return running;
}
