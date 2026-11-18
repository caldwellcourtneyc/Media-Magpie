// Title lookup with covers. Runs on the server only, so no key ever reaches the
// browser. Each media type has one provider; movies sit behind a seam so a keyed
// provider (TMDB) takes over when MOVIE_API_KEY is set, and the keyless
// Wikipedia path is used otherwise. Any failure returns an empty list: manual
// entry always works.

import type { MediaType } from "./config";
import type { LookupResult } from "./types";

export const UA = "media-log/0.1 (personal media diary; open source)";
const TIMEOUT_MS = 6000;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const yearOf = (s: unknown): number | null => {
  const m = /\b(1[89]\d{2}|20\d{2})\b/.exec(String(s ?? ""));
  return m ? Number(m[1]) : null;
};

type Provider = (q: string) => Promise<LookupResult[]>;

// ---------- comparing titles ----------
// Used here to rank results, and by lib/covers.ts to decide whether a result is the thing asked for.
// norm: lower case, no accents or punctuation. bare: that, without a leading article. words: the
// words that say something (three letters or more, not "the" or "and").
export const norm = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
export const bare = (s: string) => norm(s).replace(/^(the|a|an) /, "");
const STOP = new Set(["the", "and", "for", "with", "from", "into", "that", "this"]);
export const words = (s: string) => norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));

// ---------- books: Open Library ----------
// The free-text search alone ranks study guides above the book and misses titles
// with "&", so a title search runs beside it. Guides are dropped, and a title
// that matches what was typed (alone or followed by the author) comes first;
// among equals, the work with more editions (the one most people know).
const GUIDE =
  /\b(study guide|summary|summaries|analysis of|sparknotes|cliffsnotes|cliff notes|reading guide|discussion guide|teacher'?s guide|worksheets?|book notes|workbook for|trivia|quicklet)\b/i;
const GUIDE_AUTHOR = /\b(supersummary|bookrags|sparknotes|cliffsnotes|instaread|readtrepreneur|bright summaries|quickread|worth books)\b/i;

const olSearch = async (params: string) => {
  const u = `https://openlibrary.org/search.json?${params}&limit=10&fields=key,title,author_name,first_publish_year,cover_i,edition_count`;
  const data = (await getJson(u)) as { docs?: Array<Record<string, unknown>> };
  return data.docs ?? [];
};

const books: Provider = async (q) => {
  const [byTitle, free] = await Promise.allSettled([
    olSearch(`title=${encodeURIComponent(q.replace(/&/g, "and"))}`),
    olSearch(`q=${encodeURIComponent(q)}`),
  ]);
  if (byTitle.status === "rejected" && free.status === "rejected") throw free.reason;
  const docs = [byTitle, free].flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const nq = bare(q);
  const qw = words(q);
  const seen = new Set<string>();
  const editions = new Map(docs.map((d) => [String(d.key ?? ""), typeof d.edition_count === "number" ? d.edition_count : 0]));
  return docs
    .map((d) => ({
      title: String(d.title ?? ""),
      creator: Array.isArray(d.author_name) ? d.author_name.slice(0, 2).join(", ") : null,
      year: typeof d.first_publish_year === "number" ? d.first_publish_year : null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      source: "openlibrary",
      sourceId: String(d.key ?? ""),
    }))
    .filter((r) => !seen.has(r.sourceId) && (seen.add(r.sourceId), true))
    .filter((r) => !GUIDE.test(r.title) && !GUIDE_AUTHOR.test(r.creator ?? ""))
    // A book Open Library lacks still gets free-text hits that only match inside
    // the text; keep a result only if its title or author shares a word with q.
    .filter((r) => {
      if (!qw.length) return true;
      const rw = new Set(words(`${r.title} ${r.creator ?? ""}`));
      return qw.some((w) => rw.has(w));
    })
    .map((r, i) => {
      const nt = bare(r.title);
      const exact = nt === nq || (nt.length > 0 && nq.startsWith(nt + " "));
      return { r, i, score: (exact ? 2 : 0) + (r.coverUrl ? 1 : 0), eds: editions.get(r.sourceId) ?? 0 };
    })
    .sort((a, b) => b.score - a.score || b.eds - a.eds || a.i - b.i)
    .slice(0, 10)
    .map(({ r }) => r);
};

// ---------- music and podcasts: iTunes Search ----------
/** Apple's artwork links name their size; this asks for the 400px one. */
const artwork400 = (url: unknown): string | null => {
  const art = String(url ?? "");
  return art ? art.replace(/\/\d+x\d+bb\./, "/400x400bb.") : null;
};

const itunes =
  (entity: "album" | "podcast"): Provider =>
  async (q) => {
    const u = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=${entity}&limit=10`;
    const data = (await getJson(u)) as { results?: Array<Record<string, unknown>> };
    return (data.results ?? []).map((r) => {
      return {
        title: String(r.collectionName ?? ""),
        creator: r.artistName ? String(r.artistName) : null,
        year: yearOf(r.releaseDate),
        coverUrl: artwork400(r.artworkUrl600 ?? r.artworkUrl100),
        source: "itunes",
        sourceId: String(r.collectionId ?? ""),
        extra: entity === "podcast" && r.primaryGenreName ? String(r.primaryGenreName) : null,
      };
    });
  };

// ---------- TV: TVmaze ----------
const tv: Provider = async (q) => {
  const u = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;
  const data = (await getJson(u)) as Array<{ show: Record<string, unknown> }>;
  return (data ?? []).slice(0, 10).map(({ show: s }) => {
    const net = (s.network ?? s.webChannel) as { name?: string } | null;
    const img = s.image as { medium?: string } | null;
    return {
      title: String(s.name ?? ""),
      creator: net?.name ?? null,
      year: yearOf(s.premiered),
      coverUrl: img?.medium ?? null,
      source: "tvmaze",
      sourceId: String(s.id ?? ""),
    };
  });
};

// ---------- movies: TMDB when keyed, Wikipedia otherwise ----------
const tmdb: Provider = async (q) => {
  // Untested until a key exists. Accepts either a v3 API key or a v4 read token.
  const key = process.env.MOVIE_API_KEY!;
  const isToken = key.length > 60;
  const u = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}&include_adult=false${isToken ? "" : `&api_key=${encodeURIComponent(key)}`}`;
  const data = (await getJson(u, isToken ? { Authorization: `Bearer ${key}` } : {})) as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).slice(0, 10).map((m) => ({
    title: String(m.title ?? ""),
    creator: null,
    year: yearOf(m.release_date),
    coverUrl: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
    source: "tmdb",
    sourceId: String(m.id ?? ""),
  }));
};

const wikipediaFilms: Provider = async (q) => {
  // pilicense=any is what returns film posters (they are non-free images).
  const u =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search` +
    `&gsrsearch=${encodeURIComponent(q + " film")}&gsrlimit=12&prop=pageimages%7Cdescription` +
    `&piprop=thumbnail&pithumbsize=400&pilicense=any`;
  const data = (await getJson(u)) as {
    query?: { pages?: Array<{ title: string; index: number; pageid: number; description?: string; thumbnail?: { source: string } }> };
  };
  return (data.query?.pages ?? [])
    .filter((p) => /\bfilm\b/i.test(p.description ?? ""))
    .sort((a, b) => a.index - b.index)
    .slice(0, 10)
    .map((p) => {
      const director = /film by (.+)$/i.exec(p.description ?? "")?.[1] ?? null;
      return {
        title: p.title.replace(/\s*\((?:\d{4} )?(?:[A-Za-z ]+ )?film\)$/i, ""),
        creator: director,
        year: yearOf(p.description) ?? yearOf(p.title),
        coverUrl: p.thumbnail?.source?.split("?")[0] ?? null,
        source: "wikipedia",
        sourceId: String(p.pageid),
      };
    });
};

const movies: Provider = (q) => (process.env.MOVIE_API_KEY ? tmdb(q) : wikipediaFilms(q));

const PROVIDERS: Record<MediaType, Provider> = {
  book: books,
  music: itunes("album"),
  podcast: itunes("podcast"),
  tv,
  movie: movies,
};

export function providerName(type: MediaType): string {
  return {
    book: "Open Library",
    music: "Apple iTunes",
    podcast: "Apple iTunes",
    tv: "TVmaze",
    movie: process.env.MOVIE_API_KEY ? "TMDB" : "Wikipedia",
  }[type];
}

// ---------- books, second source: Apple Books ----------
// Only for covers (lib/covers.ts): it often has new books Open Library hasn't got a cover for yet.
export const appleBooks: Provider = async (q) => {
  const u = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=ebook&limit=10`;
  const data = (await getJson(u)) as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).map((r) => {
    return {
      title: String(r.trackName ?? ""),
      creator: r.artistName ? String(r.artistName) : null,
      year: yearOf(r.releaseDate),
      coverUrl: artwork400(r.artworkUrl100),
      source: "applebooks",
      sourceId: String(r.trackId ?? ""),
    };
  });
};

/** The LOOKUP_FIXTURE file as it stands now, or null when none is set (always, outside tests). */
export async function readFixture(): Promise<Record<string, unknown> | null> {
  const file = process.env.LOOKUP_FIXTURE;
  if (!file) return null;
  const fs = await import("node:fs");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** How many times each "fail" entry of the fixture has failed so far in this server. */
const fixtureFailures = new Map<string, number>();

/**
 * LOOKUP_FIXTURE names a JSON file of canned results ({ "book": [...], "applebooks": [...] }) used instead of
 * the network. Tests only, so they never depend on outside services; a result comes back when it shares a word with q.
 * "fail": [{ "q": "Flaky Album", "times": 1 }] makes a search containing that text fail that many times first,
 * the way a site that is down or refusing requests does.
 */
async function fixture(key: string, q: string): Promise<LookupResult[] | null> {
  const all = await readFixture();
  if (!all) return null;
  for (const f of (all.fail as { q: string; times: number }[] | undefined) ?? []) {
    const failed = fixtureFailures.get(f.q) ?? 0;
    if (failed < f.times && q.toLowerCase().includes(f.q.toLowerCase())) {
      fixtureFailures.set(f.q, failed + 1);
      throw new Error("503 from the fixture");
    }
  }
  const qw = words(q);
  return ((all[key] as LookupResult[] | undefined) ?? []).filter((r) => {
    const rw = new Set(words(`${r.title} ${r.creator ?? ""}`));
    return qw.some((w) => rw.has(w));
  });
}

/** Apple Books search, through the fixture in tests. Like lookup(), a failure comes back as error, never thrown. */
export async function lookupAppleBooks(q: string): Promise<{ results: LookupResult[]; error?: string }> {
  try {
    return { results: ((await fixture("applebooks", q)) ?? (await appleBooks(q))).filter((r) => r.title) };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : "Lookup failed" };
  }
}

export async function lookup(type: MediaType, q: string): Promise<{ results: LookupResult[]; error?: string; provider: string }> {
  const provider = providerName(type);
  try {
    const results = ((await fixture(type, q)) ?? (await PROVIDERS[type](q))).filter((r) => r.title);
    return { results, provider };
  } catch (e) {
    return { results: [], provider, error: e instanceof Error ? e.message : "Lookup failed" };
  }
}
