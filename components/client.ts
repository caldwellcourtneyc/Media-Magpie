"use client";

import { FOLLOW_NAME, MEDIA_TYPES, TV_STATUS_NAME, isFollowed, isMark, type MediaType } from "@/lib/config";
import type { Capture, Item, Log, State } from "@/lib/types";

/** JSON fetch that throws an Error with the server's message. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    // No answer at all (offline, server down): say so in plain words, and whether anything saved.
    throw new Error(method === "GET" ? "Couldn't reach the app. Check your connection." : "Couldn't reach the app, so this didn't save. Check your connection and try again.");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Signed out. Sign in again.");
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

/**
 * Half-typed words kept in this browser until they're saved or thrown away, so a reload
 * (iOS dropping the tab while you check the podcast app) doesn't lose them. A convenience:
 * storage that's unavailable just means no draft.
 */
export const draft = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, v: string | null) {
    try {
      if (v) localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    } catch {
      /* no draft then */
    }
  },
};

const pad = (n: number) => String(n).padStart(2, "0");
export function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDay(d: string | null): string {
  if (!d) return "No date";
  const [y, m, dd] = d.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  return `${MON3[m - 1]} ${dd}${y !== thisYear ? `, ${y}` : ""}`;
}

/** A coming date, said the way you'd say it mid-sentence: today, tomorrow, Oct 21. */
export function fmtWhen(d: string): string {
  if (d === today()) return "today";
  if (d === today(1)) return "tomorrow";
  return fmtDay(d);
}

export const isType = (s: string | null | undefined): s is MediaType => !!s && (MEDIA_TYPES as readonly string[]).includes(s);
export const hue = (t: MediaType | null | undefined) => (t ? `var(--${t})` : "var(--faint)");

/** Precomputed lookups the views share. */
export function index(state: State) {
  const items = new Map<string, Item>();
  for (const i of state.items) items.set(i.id, i);
  const logsByItem = new Map<string, Log[]>();
  for (const l of state.logs) {
    const arr = logsByItem.get(l.itemId) ?? [];
    arr.push(l);
    logsByItem.set(l.itemId, arr);
  }
  // chronological order per item, undated first, so the nth finish is countable
  for (const arr of logsByItem.values()) {
    arr.sort((a, b) => (a.finishedOn ?? "").localeCompare(b.finishedOn ?? "") || a.createdAt.localeCompare(b.createdAt));
  }
  const capsByItem = new Map<string, Capture[]>();
  for (const c of state.captures) {
    if (!c.itemId) continue;
    const arr = capsByItem.get(c.itemId) ?? [];
    arr.push(c);
    capsByItem.set(c.itemId, arr);
  }
  return { items, logsByItem, capsByItem };
}
export type Index = ReturnType<typeof index>;

export function captureType(c: Capture, idx: Index): MediaType | null {
  if (c.itemId) return idx.items.get(c.itemId)?.type ?? c.mediaType ?? null;
  return c.mediaType ?? null;
}

/**
 * Where you are in something in progress, for covers and headers. Shows go by seasons seen (you mark a
 * season when you finish it, not each episode); others by what you typed.
 * Nothing when you haven't said, so a cover never claims a place you didn't give.
 */
export function whereYouAre(i: Pick<Item, "type" | "progress" | "seasonsSeen">): string | null {
  if (i.type === "tv") return i.seasonsSeen ? `Through S${i.seasonsSeen}` : null;
  return i.progress || null;
}

/**
 * Where you stand with an item, in words, or null when there's nothing to say.
 * Podcasts, artists, authors: Following unless paused, dropped, ended, or sitting in the queue to try.
 * TV: Watching (the In Progress queue), Caught up and waiting, Done, Paused, Dropped.
 */
export function statusLabel(i: Pick<Item, "type" | "entity" | "status" | "queue">): string | null {
  if (isFollowed(i)) {
    if (i.status === "paused" || i.status === "dropped" || i.status === "ended" || i.status === "following") return FOLLOW_NAME[i.status];
    return i.queue ? null : FOLLOW_NAME.following;
  }
  if (i.type === "tv") {
    if (i.queue === "in_progress") return TV_STATUS_NAME.watching;
    if (i.status === "following" || i.status === "done") return TV_STATUS_NAME[i.status];
    if (i.status === "paused" || i.status === "dropped" || i.status === "ended") return FOLLOW_NAME[i.status];
  }
  return null;
}

// Shows log seasons and episodes, so a second finish is rarely a rewatch: the detail says what it was.
const AGAIN: Record<MediaType, string | null> = { tv: null, movie: "Rewatch", book: "Reread", music: "Relisten", podcast: null };
/** "Rewatch", "Rewatch #2"... for the nth finish of an item. Podcasts log episodes, so they never say it. */
export function againLabel(type: MediaType, n: number): string | null {
  const w = AGAIN[type];
  if (!w || n < 2) return null;
  return n === 2 ? w : `${w} #${n - 1}`;
}

export function attribution(c: Capture, idx: Index): string {
  const item = c.itemId ? idx.items.get(c.itemId) : null;
  const parts = [c.who, item ? item.title : c.source].filter(Boolean) as string[];
  return parts.join(" · ");
}

/** A mark (a capture with no words yet) said as what it has: "Episode 4 at 45:00", or "Screenshot". */
export function markLine(c: Capture): string {
  const at = [c.detail, c.time ? `at ${c.time}` : null].filter(Boolean).join(" ");
  return at || (c.image ? "Screenshot" : c.url ? c.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60) : "No words yet");
}
export { isMark };

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
