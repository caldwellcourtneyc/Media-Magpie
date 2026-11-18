import type { CaptureKind, LibbyLibrary, MediaType, Queue, Status, Tier } from "./config";

export type Item = {
  id: string;
  type: MediaType;
  /** "work" is a specific thing; "creator" is an artist or author still needing a pick. */
  entity: "work" | "creator";
  title: string;
  creator: string | null;
  year: number | null;
  coverUrl: string | null;
  lookupSource: string | null;
  lookupId: string | null;
  tier: Tier | null;
  queue: Queue | null;
  queuedAt: string | null;
  /** Where you moved it in its queue section. Null until you move it (lib/order.ts). */
  sortPos: number | null;
  progress: string | null;
  tags: string[];
  /** Streaming services it is on (keys from SERVICES in lib/config.ts). */
  watchOn: string[];
  /** Following / paused / dropped / done. Null on a podcast or album means following. */
  status: Status | null;
  /** TV: how many seasons you have seen. */
  seasonsSeen: number | null;
  /** Where an imported item came from (e.g. which old list). Not your note. */
  origin: string | null;
  /** You didn't like it. Everything else in the library counts as liked (Coming Soon follows it). */
  disliked: boolean;
  /** The season you hid from Coming Soon ("s2"); a later season brings the show back. "release" hides a movie. */
  soonHidden: string | null;
  /** Movies: the release date (YYYY-MM-DD), set by hand or by a script. Puts it in Coming soon. */
  releaseOn: string | null;
  /** TV: next air dates from TVmaze, cached and refreshed about twice a day. Derived, not your data. */
  airInfo: AirInfo | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** What TVmaze said about a show's next airing, the last time it was asked. */
export type AirInfo = {
  /** When TVmaze was asked (ISO time). */
  checkedAt: string;
  /** TVmaze's show status: Running, Ended, To Be Determined, In Development. */
  status: string | null;
  /** The next episode with a date, if TVmaze has one. */
  next: { season: number; episode: number | null; date: string } | null;
  /** The season that next episode belongs to. end is its last scheduled episode's date. */
  season: { number: number; premiere: string | null; end: string | null; episodes: number | null } | null;
  /** Every season with a premiere date, so the app can tell which is the latest one out. Older caches lack it. */
  premieres?: { season: number; date: string }[];
};

export type Log = {
  id: string;
  itemId: string;
  /** YYYY-MM-DD, or null when the date is unknown. */
  finishedOn: string | null;
  /** Season, episode, edition: what exactly was finished this time. */
  detail: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Capture = {
  id: string;
  kind: CaptureKind | string;
  body: string;
  itemId: string | null;
  mediaType: MediaType | null;
  who: string | null;
  source: string | null;
  url: string | null;
  note: string | null;
  tags: string[];
  /** Where in the item it came from: episode, track, page. */
  detail: string | null;
  /** Where in the episode, film or track: "13:09" or "1:13:09". */
  time: string | null;
  /** Your "Talk about it" switch: on means it waits for a talk with Claude. */
  talk: boolean;
  /** The day it was talked about. Setting it turns talk off. */
  talkedOn: string | null;
  /** Claude's one line on where the talk landed. Never part of your note. */
  talkNote: string | null;
  /** Claude wrote the words (finishing a mark for you). Cleared when you rewrite them in the app. */
  byClaude: boolean;
  /** The live image, if any. The bytes are at GET /api/images/:id. Read-only here. */
  image: CaptureImage | null;
  capturedOn: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CaptureImage = { id: string; type: string; bytes: number; width: number | null; height: number | null };

/**
 * An image row in an export file. An export carries the bytes as base64 (`data`), so the file stays
 * whole. A local daily backup carries `file` instead: the image sits once in the backup folder's images/.
 */
export type ImageRow = CaptureImage & { captureId: string; data?: string; file?: string; createdAt: string; deletedAt: string | null };

/**
 * Libby libraries and the order of types ride along with the data so the page has them on first render;
 * they are settings, not entries.
 */
export type State = { items: Item[]; logs: Log[]; captures: Capture[]; libby: LibbyLibrary[]; typeOrder: MediaType[] };

export type ExportFile = {
  format: string;
  version: number;
  exportedAt: string;
  counts: { items: number; logs: number; captures: number; images: number };
  items: Item[];
  logs: Log[];
  captures: Capture[];
  images: ImageRow[];
};

export type LookupResult = {
  title: string;
  creator: string | null;
  year: number | null;
  coverUrl: string | null;
  source: string;
  sourceId: string;
  extra?: string | null;
};
