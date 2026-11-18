// The product name lives here and in the README title only, so a rename is a
// two-line change.
export const APP_NAME = "Media Magpie";

/**
 * TEST_COPY=1 marks a copy that isn't the real library (the owner's laptop, once the hosted one is
 * real), with a strip on every page. Read on the server only.
 */
export const testCopy = () => process.env.TEST_COPY === "1";
export const TEST_COPY_LINE = "Test copy: not your real library";

/**
 * WATCH_WITH_LABEL names who you watch with ("With Sam"). It's both the words on the chip and the tag on
 * those shows. It lives in the environment so nobody's name is in the code. Unset, the split doesn't
 * appear at all. Read on the server only.
 */
export const watchWithLabel = () => process.env.WATCH_WITH_LABEL?.trim() || null;

export const MEDIA_TYPES = ["tv", "movie", "music", "podcast", "book"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** True when the list is the five types, each once, in any order. */
export const isTypeOrder = (v: unknown): v is MediaType[] =>
  Array.isArray(v) && v.length === MEDIA_TYPES.length && MEDIA_TYPES.every((t) => v.includes(t));

/**
 * The types in your order (Settings, Order of types; kept on the server), for anything that lists them on
 * screen. A bad or missing order reads as MEDIA_TYPES. With `only`, just those types, still in your order.
 * Validation, the schema, exports and the API keep the fixed MEDIA_TYPES.
 */
export function typesInOrder(order: unknown, only: readonly MediaType[] = MEDIA_TYPES): MediaType[] {
  return (isTypeOrder(order) ? order : [...MEDIA_TYPES]).filter((t) => only.includes(t));
}

/** Nav and filter labels (plural, as a shelf). */
export const TYPE_NAV: Record<MediaType, string> = {
  tv: "TV",
  movie: "Movies",
  music: "Music",
  podcast: "Podcasts",
  book: "Books",
};

/** Label for one item of the type. */
export const TYPE_ONE: Record<MediaType, string> = {
  tv: "TV",
  movie: "Movie",
  music: "Album",
  podcast: "Podcast",
  book: "Book",
};

/** What a "creator" entry is called for each type (an artist or author with no work picked yet). */
export const CREATOR_ONE: Record<MediaType, string> = {
  tv: "Creator",
  movie: "Filmmaker",
  music: "Artist",
  podcast: "Host",
  book: "Author",
};

/** Finished verb per type, for buttons and history. */
export const FINISH_VERB: Record<MediaType, string> = {
  tv: "Watched",
  movie: "Watched",
  music: "Listened",
  podcast: "Listened",
  book: "Read",
};

/** App views, as they appear in ?view=. */
export const VIEWS = ["now", "library", "queue", "captures", "settings"] as const;
export type View = (typeof VIEWS)[number];
/** Reads ?view=, sending old Favorites links to the Library and old Diary links home. */
export function parseView(v: string | null | undefined): View {
  if (v === "faves") return "library";
  return (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "now";
}

/** Tiers, lowest to highest. */
export const TIERS = ["love", "fave", "top"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_NAME: Record<Tier, string> = { love: "Love", fave: "Fave", top: "Top Shelf" };

/**
 * Where you stand with something you keep up with rather than finish. Podcasts, music
 * artists and authors are followed: an empty status on them means Following, so nothing
 * needs a migration and a podcast queued to try stays queued. Ended is the podcast's
 * choice (they stopped making it), Dropped is yours. TV uses the same values with its own
 * labels (Following reads as "Caught up, waiting"); Watching is the In Progress queue.
 */
export const STATUSES = ["following", "paused", "dropped", "ended", "done"] as const;
export type Status = (typeof STATUSES)[number];
export type FollowStatus = "following" | "paused" | "dropped" | "ended";
export const FOLLOW_NAME: Record<FollowStatus, string> = { following: "Following", paused: "Paused", dropped: "Dropped", ended: "Ended" };
/** Followed, never finished: podcasts, plus artists and authors (people, not their albums or books). */
export function isFollowed(i: { type: MediaType; entity: "work" | "creator" }): boolean {
  return i.type === "podcast" || (i.entity === "creator" && (i.type === "music" || i.type === "book"));
}
/** Albums: kept with a tier and captures, never logged per listen. */
/** A mark is a capture saved with no words yet, to finish later. */
export const isMark = (c: { body: string }) => !c.body.trim();

export const isAlbum = (i: { type: MediaType; entity: "work" | "creator" }) => i.type === "music" && i.entity === "work";
export const TV_STATUS_NAME = { watching: "Watching", following: "Caught up, waiting", done: "Done" } as const;
/** Types where a capture can say when in it (13:09): the ones you listen to or watch. */
export const TIME_TYPES: readonly MediaType[] = ["podcast", "tv", "movie", "music"];
/** Where a capture came from inside the item: episode, track, page. */
export const CAPTURE_DETAIL: Record<MediaType, string> = { tv: "Episode", movie: "Scene", music: "Track", podcast: "Episode", book: "Page or chapter" };

/** Queue sections. */
export const QUEUES = ["in_progress", "up_next", "saved"] as const;
export type Queue = (typeof QUEUES)[number];
export const QUEUE_NAME: Record<Queue, string> = {
  in_progress: "In Progress",
  up_next: "Up Next",
  saved: "Saved for Later",
};

/**
 * Streaming services offered as one-tap choices on queued TV and movies.
 * Edit this list to match the services you have; keys are what gets stored.
 */
export const SERVICES = [
  ["prime", "Prime"],
  ["apple", "Apple"],
  ["netflix", "Netflix"],
  ["paramount", "Paramount"],
  ["peacock", "Peacock"],
  ["disney", "Disney"],
  ["hulu", "Hulu"],
  ["hbo", "HBO"],
  // Movies only: one to see on the big screen. Combines with a service, like any other.
  ["theater", "Theater"],
  // Not on any of yours: kept on the radar until it is. Never combined with a service.
  ["none", "No Access"],
] as const;
export type Service = (typeof SERVICES)[number][0];
export const SERVICE_KEYS = SERVICES.map(([k]) => k) as [Service, ...Service[]];
export const SERVICE_NAME: Record<string, string> = Object.fromEntries(SERVICES);
export const NOT_ON_MINE = "none";
export const THEATER = "theater";
/** Which types and queue sections show the streaming choice. */
export const STREAM_TYPES: readonly MediaType[] = ["tv", "movie"];
export const STREAM_QUEUES: readonly Queue[] = ["up_next", "saved"];

/**
 * Capture kinds. Validated in the app, not by a database constraint, so adding a
 * kind later is a one-line change here with no migration.
 */
/** In this order: the capture form's chips and Shiny things' filter read this way. */
export const CAPTURE_KINDS = ["note", "idea", "link", "quote"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];
export const KIND_NAME: Record<CaptureKind, string> = {
  quote: "Quote",
  idea: "Idea",
  note: "Note",
  link: "Link",
};

export const EXPORT_FORMAT = "media-log-export";
export const EXPORT_VERSION = 1;

/**
 * Libby libraries, set in Settings and kept in the database (meta table), since each copy of this app has
 * its own. key is the library's code in Libby: the word after /library/ in libbyapp.com's address bar.
 */
export type LibbyLibrary = { key: string; name: string };
export const LIBBY_MAX = 6;
/** A Libby search at one library for a book (title and author) or an author (their name). */
export function libbySearchUrl(key: string, item: { title: string; creator: string | null; entity: "work" | "creator" }): string {
  const q = item.entity === "creator" || !item.creator ? item.title : `${item.title} ${item.creator}`;
  return `https://libbyapp.com/search/${encodeURIComponent(key)}/search/query-${encodeURIComponent(q.trim())}/page-1`;
}
