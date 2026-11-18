// The address bar holds the view, the type filter, the who's-watching chip and the open item, so
// back, forward and reload all work.

import { parseView, type MediaType, type View } from "@/lib/config";
import { isType } from "../client";

export type Filter = MediaType | "all";
/** Who a show is for: everything, you alone (anything not tagged), or with the person in WATCH_WITH_LABEL. */
export type WatchWith = "all" | "solo" | "with";

export function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const t = p.get("type");
  const w = p.get("with");
  return { view: parseView(p.get("view")), filter: (isType(t) ? t : "all") as Filter, item: p.get("item"), watch: (w === "with" || w === "solo" ? w : "all") as WatchWith };
}

/** Changes what is given and keeps the rest. A new history step unless `replace`. */
export function pushUrl(next: { view?: View; filter?: Filter; item?: string | null; watch?: WatchWith }, replace = false) {
  const cur = readUrl();
  const v = next.view ?? cur.view;
  const f = next.filter ?? cur.filter;
  const w = next.watch ?? cur.watch;
  const it = next.item === undefined ? cur.item : next.item;
  const p = new URLSearchParams();
  if (v !== "now") p.set("view", v);
  if (f !== "all") p.set("type", f);
  if (w !== "all") p.set("with", w);
  if (it) p.set("item", it);
  const url = `${window.location.pathname}${p.toString() ? "?" + p : ""}`;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}
