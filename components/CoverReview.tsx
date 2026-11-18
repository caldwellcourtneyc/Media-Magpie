"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TYPE_ONE, type MediaType } from "@/lib/config";
import type { CoverPick } from "@/lib/covers";
import type { Item } from "@/lib/types";
import { useApp } from "./App";
import { checkCover, Cover } from "./bits";
import { api } from "./client";
import { Sheet } from "./Sheet";

type Row = {
  id: string;
  /** No cover at all, or a link that doesn't load. */
  why: "none" | "broken";
  st: "waiting" | "done" | "failed";
  pick: CoverPick | null;
  use: boolean;
};

const SOURCE_NAME: Record<string, string> = {
  openlibrary: "Open Library",
  applebooks: "Apple Books",
  itunes: "Apple",
  tvmaze: "TVmaze",
  tmdb: "TMDB",
  wikipedia: "Wikipedia",
};

/** Things with a cover worth looking for: specific works, not artists or authors. */
export const coverless = (items: Item[]) => items.filter((i) => i.entity === "work" && !i.coverUrl);

/** Your order of types, then by title. */
const byTypeThenTitle = (types: MediaType[]) => (a: Item, b: Item) => types.indexOf(a.type) - types.indexOf(b.type) || a.title.localeCompare(b.title);

/**
 * Missing covers: looks each one up (one at a time, so the lookup sites aren't rushed) and shows what it
 * found. Sure matches start ticked, the rest unticked; nothing is saved until you tap Save.
 */
export function CoverReview({ onClose }: { onClose: () => void }) {
  const { state, idx, reload, toast, openItem, types } = useApp();
  const order = byTypeThenTitle(types);
  const [rows, setRows] = useState<Row[]>(() =>
    coverless(state.items)
      .sort(order)
      .map((i) => ({ id: i.id, why: "none", st: "waiting", pick: null, use: false })),
  );
  const [checkingLinks, setCheckingLinks] = useState(true);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Cover links that don't load join the list.
  useEffect(() => {
    const withCover = state.items.filter((i) => i.entity === "work" && i.coverUrl);
    Promise.all(withCover.map(async (i) => ((await checkCover(i.coverUrl!)) ? null : i))).then((found) => {
      if (!alive.current) return;
      const bad = found.filter((i): i is Item => i !== null).sort(order);
      setRows((rs) => [...rs, ...bad.filter((b) => !rs.some((r) => r.id === b.id)).map((b) => ({ id: b.id, why: "broken" as const, st: "waiting" as const, pick: null, use: false }))]);
      setCheckingLinks(false);
    });
    // Once, on open: the list is what was missing then.
  }, []);

  // One lookup at a time, in list order, until none are waiting. kick wakes the effect when one finishes.
  const next = rows.find((r) => r.st === "waiting");
  const [kick, setKick] = useState(0);
  useEffect(() => {
    if (!next || busy.current) return;
    busy.current = true;
    const id = next.id;
    api<{ pick: CoverPick | null; failed: boolean }>("/api/covers", { body: { id } })
      .then(
        (r) => ({ st: (r.failed ? "failed" : "done") as Row["st"], pick: r.pick }),
        () => ({ st: "failed" as const, pick: null }),
      )
      .then(async (r) => {
        if (!alive.current) return;
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, st: r.st, pick: r.pick, use: Boolean(r.pick?.sure) } : x)));
        await new Promise((ok) => setTimeout(ok, 250));
        busy.current = false;
        if (alive.current) setKick((k) => k + 1);
      });
  }, [next?.id, kick]);

  const live = rows.filter((r) => idx.items.has(r.id));
  const looked = live.filter((r) => r.st !== "waiting").length;
  const sure = live.filter((r) => r.pick?.sure);
  const check = live.filter((r) => r.pick && !r.pick.sure);
  const none = live.filter((r) => r.st === "done" && !r.pick);
  const failed = live.filter((r) => r.st === "failed" && !r.pick);
  const chosen = live.filter((r) => r.use && r.pick);
  const running = Boolean(next) || checkingLinks;

  const toggle = (id: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, use: !r.use } : r)));
  const retry = () => setRows((rs) => rs.map((r) => (r.st === "failed" && !r.pick ? { ...r, st: "waiting" } : r)));

  async function save() {
    setSaving(true);
    let n = 0;
    const done = new Set<string>();
    for (const r of chosen) {
      const it = idx.items.get(r.id);
      if (!it || !r.pick) continue;
      try {
        // A show also gets its TVmaze id when it has none: that's what Coming soon reads air dates from.
        const body: Partial<Item> = { coverUrl: r.pick.coverUrl };
        if (!it.lookupSource) Object.assign(body, { lookupSource: r.pick.source, lookupId: r.pick.sourceId });
        await api(`/api/items/${r.id}`, { method: "PATCH", body });
        done.add(r.id);
        n++;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't save a cover", { bad: true });
        break;
      }
    }
    await reload();
    setSaving(false);
    setRows((rs) => rs.filter((r) => !done.has(r.id)));
    if (n) toast(`Saved ${n} ${n === 1 ? "cover" : "covers"}`);
  }

  const itemLine = (r: Row) => {
    const it = idx.items.get(r.id)!;
    return (
      <>
        <b>{it.title}</b>
        <small>{[TYPE_ONE[it.type], it.creator, it.type === "podcast" ? null : it.year, r.why === "broken" ? "its cover link doesn't load" : null].filter(Boolean).join(" · ")}</small>
      </>
    );
  };

  const matchRow = (r: Row) => {
    const it = idx.items.get(r.id)!;
    const p = r.pick!;
    return (
      <div key={r.id} className="crow">
        <Cover item={{ title: p.title, type: it.type, coverUrl: p.coverUrl, entity: "work" }} />
        <div className="crow-text">
          {itemLine(r)}
          <small className="found">
            Found: {[p.title, p.creator, it.type === "podcast" ? null : p.year].filter(Boolean).join(" · ")} ({SOURCE_NAME[p.source] ?? p.source})
          </small>
        </div>
        <button role="checkbox" aria-checked={r.use} aria-label={`Use this cover for ${it.title}`} className={`chip ${r.use ? "on" : ""}`} onClick={() => toggle(r.id)}>
          {r.use ? "✓ Use" : "Use"}
        </button>
      </div>
    );
  };

  const plainRow = (r: Row) => (
    <button key={r.id} className="res" onClick={() => openItem(r.id)}>
      <Cover item={idx.items.get(r.id)!} tiny />
      <span>{itemLine(r)}</span>
    </button>
  );

  return (
    <Sheet
      title="Missing covers"
      onClose={onClose}
      dirty={chosen.length > 0 && !saving}
      label="Missing covers"
      className="coversheet"
      foot={
        <button className="btn" disabled={!chosen.length || saving} onClick={save}>
          {saving ? "Saving…" : chosen.length ? `Save ${chosen.length} ${chosen.length === 1 ? "cover" : "covers"}` : "Nothing ticked to save"}
        </button>
      }
    >
      <p className="hint" aria-live="polite">
        {running
          ? `Looking things up: ${looked} of ${live.length}${checkingLinks ? ", and checking the covers you have" : ""}. Matches show as they come in.`
          : live.length
            ? `Looked up ${live.length}. Good matches are ticked; check the others before ticking them.`
            : "Everything has a cover."}
      </p>

      {sure.length > 0 && (
        <section className="cgroup">
          <h3>Good matches {sure.length}</h3>
          <p className="hint">The title matches and something else agrees: the author, artist or year, or nothing else has that name.</p>
          {sure.map(matchRow)}
        </section>
      )}
      {check.length > 0 && (
        <section className="cgroup">
          <h3>Check these {check.length}</h3>
          <p className="hint">Only the title matches, so it may be something else with the same name.</p>
          {check.map(matchRow)}
        </section>
      )}
      {failed.length > 0 && !running && (
        <section className="cgroup">
          <h3>Couldn&apos;t check {failed.length}</h3>
          <p className="hint">A lookup site didn&apos;t answer. It may be busy; try again in a few minutes.</p>
          <button className="btn small ghost" style={{ justifySelf: "start" }} onClick={retry}>
            Try these again
          </button>
          <div className="results">{failed.map(plainRow)}</div>
        </section>
      )}
      {none.length > 0 && (
        <section className="cgroup">
          <h3>No match found {none.length}</h3>
          <p className="hint">Open one and use Edit details or cover to search with other words, or paste a cover link.</p>
          <div className="results">{none.map(plainRow)}</div>
        </section>
      )}
    </Sheet>
  );
}

/** The Settings entry: how many are missing, and the button that opens the review. */
export function CoverSettings() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const missing = useMemo(() => coverless(state.items).length, [state.items]);
  return (
    <section className="setsec">
      <h3>Covers</h3>
      <p>
        {missing === 0
          ? "Everything has a cover. Find covers also checks for links that no longer load."
          : `${missing} ${missing === 1 ? "thing has" : "things have"} no cover. You see every match before anything is saved.`}
      </p>
      <div>
        <button className="btn" onClick={() => setOpen(true)}>
          Find covers
        </button>
      </div>
      {open && <CoverReview onClose={() => setOpen(false)} />}
    </section>
  );
}
