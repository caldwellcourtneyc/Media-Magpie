"use client";

import { useMemo, useState } from "react";
import { NOT_ON_MINE, STREAM_TYPES } from "@/lib/config";
import { comingSoon, soonWhat, type SoonEntry } from "@/lib/soon";
import type { Item } from "@/lib/types";
import { whereToWatch } from "@/lib/where";
import { useApp } from "./App";
import { api, fmtDay, today } from "./client";

/** Coming Soon entries for the library, worked out with the viewer's own today. */
export function useSoon(includeHidden = false): SoonEntry[] {
  const { state } = useApp();
  return useMemo(() => comingSoon(state.items, today(), { includeHidden }), [state.items, includeHidden]);
}

/** Hide one season of a show from Coming Soon, or bring it back. Hiding offers Undo. */
export function useHideSoon() {
  const { run, toast } = useApp();
  return {
    hide: async (e: SoonEntry) => {
      const r = await run(() => api(`/api/items/${e.item.id}`, { method: "PATCH", body: { soonHidden: e.key } }));
      if (r)
        toast(e.kind === "release" ? `Hid ${e.item.title} from Coming Soon` : `Hid ${e.item.title} until its next season`, {
          action: { label: "Undo", fn: () => run(() => api(`/api/items/${e.item.id}`, { method: "PATCH", body: { soonHidden: null } }), "Back in Coming Soon") },
        });
    },
    show: (item: Item) => run(() => api(`/api/items/${item.id}`, { method: "PATCH", body: { soonHidden: null } }), "Back in Coming Soon"),
  };
}

/** One dated line: the date in the display face, the title, and what's happening. It opens the item. */
function SoonLine({ e }: { e: SoonEntry }) {
  const { openItem } = useApp();
  return (
    <button className="soonline" onClick={() => openItem(e.item.id)}>
      <span className="d">{e.date === today() ? "Today" : e.date === today(1) ? "Tomorrow" : fmtDay(e.date)}</span>
      <b>{e.item.title}</b>
      <small>{soonWhat(e, fmtDay)}</small>
    </button>
  );
}

/**
 * The Up next section: every dated new season or episode from shows in your library, and every
 * movie with a release date ahead, soonest first, as the dated lines Now uses (no covers).
 * Undated news never shows, and with nothing dated the section isn't drawn. Hiding lives on the
 * item's own page; hidden ones stay reachable here through "Show N hidden".
 */
export function ComingSoonSection({ service }: { service: string | null }) {
  const { filter, inWatch } = useApp();
  const { show } = useHideSoon();
  const [showHidden, setShowHidden] = useState(false);
  const all = useSoon(true);
  // Shows (dates from TVmaze) and movies (a release date set by hand or by a script).
  if (filter !== "all" && !STREAM_TYPES.includes(filter)) return null;
  const mine = all.filter((e) => (filter === "all" || e.item.type === filter) && inWatch(e.item) && (!service || whereToWatch(e.item).keys.includes(service)));
  const visible = mine.filter((e) => e.item.soonHidden !== e.key);
  const hidden = mine.filter((e) => e.item.soonHidden === e.key);
  if (!visible.length && !hidden.length) return null;

  return (
    <section className="soon">
      <h2 className="h2">
        Coming soon<small>{visible.length}</small>
      </h2>
      {visible.length > 0 && (
        <div className="soonlist">
          {visible.map((e) => (
            <SoonLine key={e.item.id} e={e} />
          ))}
        </div>
      )}
      {hidden.length > 0 && (
        <button className="linkbtn" onClick={() => setShowHidden(!showHidden)} aria-expanded={showHidden}>
          {showHidden ? "Leave hidden ones out" : `Show ${hidden.length} hidden`}
        </button>
      )}
      {showHidden && hidden.length > 0 && (
        <div className="soonlist hid">
          {hidden.map((e) => (
            <div key={e.item.id} className="soonhid">
              <SoonLine e={e} />
              <button className="linkbtn" onClick={() => show(e.item)}>
                Show again
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Now's strip: what lands in the next 30 days from shows you aren't already watching (their
 * covers say it) and can get. Nothing renders when nothing is close.
 */
export function SoonStrip() {
  const { filter, inWatch, go } = useApp();
  const entries = useSoon();
  if (filter !== "all" && filter !== "tv" && filter !== "movie") return null;
  const horizon = today(30);
  const near = entries.filter(
    (e) => (filter === "all" || e.item.type === filter) && inWatch(e.item) && e.date <= horizon && e.item.queue !== "in_progress" && !e.item.watchOn.includes(NOT_ON_MINE)
  );
  if (!near.length) return null;
  return (
    <section className="now-soon">
      <h2 className="h2">
        Coming soon<small>next 30 days</small>
      </h2>
      <div className="soonlist">
        {near.slice(0, 5).map((e) => (
          <SoonLine key={e.item.id} e={e} />
        ))}
      </div>
      <button className="linkbtn" onClick={() => go("queue")}>
        All coming soon
      </button>
    </section>
  );
}
