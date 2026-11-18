"use client";

import { useEffect, useState } from "react";
import { EXAMPLES, type Example } from "@/lib/examples";
import type { LookupResult } from "@/lib/types";
import { useApp } from "./App";
import { Cover } from "./bits";
import { api, normalize } from "./client";

/**
 * Now, while the library has nothing in it: a welcome with three first steps, a way to load the
 * demo, and a faint shelf of examples showing what the page looks like full.
 */
export function Welcome() {
  const { startAdd, run } = useApp();
  const [busy, setBusy] = useState(false);
  const loadDemo = async () => {
    setBusy(true);
    await run(() => api("/api/demo", { method: "POST", body: {} }), "Demo library loaded. Delete anything you don't want.");
    setBusy(false);
  };
  return (
    <div className="welcome">
      <h1>Your library is empty.</h1>
      <p className="welcome-sub">Start with one thing you&apos;re watching, reading or listening to. It shows up here.</p>
      <div className="welcome-acts">
        <button className="btn" onClick={() => startAdd({ mode: "queue", type: "tv", queue: "in_progress" })}>
          Add a show
        </button>
        <button className="btn ghost" onClick={() => startAdd({ mode: "queue" })}>
          Queue something
        </button>
        <button className="btn ghost" onClick={() => startAdd({ mode: "capture" })}>
          Capture a line
        </button>
      </div>
      <button className="linkbtn" onClick={loadDemo} disabled={busy}>
        {busy ? "Loading the demo…" : "Or load a small demo library to look around"}
      </button>
      <GhostShelf />
    </div>
  );
}

// Example covers found so far, kept for the session (a title that found none is kept as null, so
// it isn't asked for twice; one whose lookup failed isn't kept, and is tried again next time).
const found = new Map<string, string | null>();
const keyOf = (e: Example) => `${e.type}:${e.title}`;

/** The result that is surely this title: the same name, the same year when one is given. Never a near miss. */
function coverFor(e: Example, results: LookupResult[]): string | null {
  const want = normalize(e.match ?? e.title);
  const by = (r: LookupResult) => r.coverUrl && (!e.creator || normalize(r.creator ?? "").includes(normalize(e.creator)));
  const same = results.filter((r) => by(r) && normalize(r.title) === want);
  // An album often carries its edition in the name ("Rumours (Deluxe)"); a year or creator keeps a namesake out.
  const edition = e.type === "music" ? results.filter((r) => by(r) && normalize(r.title).startsWith(want + " ")) : [];
  const pick = (e.year && [...same, ...edition].find((r) => r.year === e.year)) || same[0] || edition[0];
  return pick?.coverUrl ?? null;
}

/**
 * What Now looks like with things in it: example covers, faint and out of reach (aria-hidden and
 * inert), fetched a few at a time after the page is up. They are only ever drawn here: never
 * saved, never in state, exports, counts or search, and gone once the library has an item.
 */
function GhostShelf() {
  const [, redraw] = useState(0);
  useEffect(() => {
    let live = true;
    const todo = EXAMPLES.filter((e) => !found.has(keyOf(e)));
    let next = 0;
    const work = async () => {
      while (live && next < todo.length) {
        const e = todo[next++];
        try {
          const r = await api<{ results: LookupResult[]; error?: string }>(`/api/lookup?type=${e.type}&q=${encodeURIComponent(e.q ?? e.match ?? e.title)}`);
          if (!r.error) found.set(keyOf(e), coverFor(e, r.results));
        } catch {
          /* no network, or the lookup is down: the title keeps its missing-cover tile */
        }
        if (live) redraw((n) => n + 1);
      }
    };
    for (let k = 0; k < 3; k++) void work();
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="ghostwrap">
      <p className="ghost-note">These are examples. Your first add replaces them.</p>
      <div className="ghostshelf" aria-hidden inert>
        <div className="ghostrow">
          {EXAMPLES.map((e) => (
            <div key={keyOf(e)} className="poster">
              <Cover item={{ title: e.title, type: e.type, entity: "work", coverUrl: found.get(keyOf(e)) ?? null }} />
              <b>{e.title}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
