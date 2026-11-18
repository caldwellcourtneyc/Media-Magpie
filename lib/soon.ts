// Coming Soon: which shows have something on the way, worked out from the cached TVmaze
// dates (lib/airdates.ts). Pure, so the page can run it with the viewer's own today.
// A show counts when it's in the library, not marked disliked and not Dropped (Paused ones
// stay). Nothing undated ever
// appears, and an entry leaves by itself once its date passes and TVmaze has nothing next.

import type { Item } from "./types";

export type SoonEntry = {
  item: Item;
  /** premiere: a season (or the show) starts on date. airing: the season is running, next episode on date. release: a movie comes out. */
  kind: "premiere" | "airing" | "release";
  date: string;
  season: number;
  /** The season's last scheduled episode, when TVmaze has it (on or after date). */
  finale: string | null;
  /** What hiding stores in soonHidden: the next season brings the show back. */
  key: string;
};

export const soonKey = (season: number) => `s${season}`;
/** What hiding stores for a movie: it stays out of Coming soon until shown again. */
export const RELEASE_KEY = "release";

/** The newest season that has premiered by today, per TVmaze; null when TVmaze hasn't said. */
export function latestSeasonOut(item: Item, today: string): number | null {
  const out = (item.airInfo?.premieres ?? []).filter((p) => p.date <= today).map((p) => p.season);
  return out.length ? Math.max(...out) : null;
}

/** Every Coming Soon entry on or after today, soonest first. Hidden ones are left out unless asked for. */
export function comingSoon(items: Item[], today: string, opts: { includeHidden?: boolean } = {}): SoonEntry[] {
  const out: SoonEntry[] = [];
  for (const item of items) {
    // Dropped is you saying you're done with it, as Not a Fan is; Paused still wants the date.
    if (item.status === "dropped") continue;
    // A movie counts once it has a release date still ahead (set by hand or by a script).
    if (item.type === "movie") {
      if (item.deletedAt || item.disliked || !item.releaseOn || item.releaseOn < today) continue;
      if (!opts.includeHidden && item.soonHidden === RELEASE_KEY) continue;
      out.push({ item, kind: "release", date: item.releaseOn, season: 0, finale: null, key: RELEASE_KEY });
      continue;
    }
    const a = item.airInfo;
    if (item.type !== "tv" || item.deletedAt || item.disliked || !a?.next) continue;
    const { next, season } = a;
    if (next.date < today) continue;
    const key = soonKey(next.season);
    if (!opts.includeHidden && item.soonHidden === key) continue;
    const premiere = next.episode === 1 || (season?.premiere != null && season.premiere >= next.date);
    // Equal to date means the next episode is the finale.
    const finale = season?.end && season.end >= next.date ? season.end : null;
    out.push({ item, kind: premiere ? "premiere" : "airing", date: next.date, season: next.season, finale, key });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.item.title.localeCompare(y.item.title));
}

/** What's happening, for a row that shows the date beside it: "Season 2 starts", "Season 6 finale", "Season 2 airing · finale Oct 30". */
export function soonWhat(e: SoonEntry, fmt: (d: string) => string): string {
  if (e.kind === "release") return "Comes out";
  if (e.kind === "premiere") return e.season === 1 ? "Premieres" : `Season ${e.season} starts`;
  if (e.finale === e.date) return `Season ${e.season} finale`;
  return `Season ${e.season} airing${e.finale ? ` · finale ${fmt(e.finale)}` : ""}`;
}

/** One line with the date, for a cover: "Season 2 starts Nov 6", "Finale Oct 21", "New episode Tomorrow". */
export function soonLine(e: SoonEntry, when: (d: string) => string): string {
  if (e.kind === "release") return `Comes out ${when(e.date)}`;
  if (e.kind === "premiere") return `${e.season === 1 ? "Premieres" : `Season ${e.season} starts`} ${when(e.date)}`;
  return `${e.finale === e.date ? "Finale" : "New episode"} ${when(e.date)}`;
}
