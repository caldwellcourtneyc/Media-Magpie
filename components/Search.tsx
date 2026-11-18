"use client";

// Search everything from the nav: items by title, person, list heading, finish notes and
// their captures; standalone captures by text, person, source and note.

import { TYPE_NAV, type MediaType } from "@/lib/config";
import type { Capture, Item } from "@/lib/types";
import { useApp } from "./App";
import { Cover, TierBadge, hueStyle } from "./bits";
import { attribution, captureType, hue, isMark, markLine, normalize, type Index } from "./client";

export type Hit = { item: Item; why: string | null };

const WHY: Record<string, string> = { person: "matched the person", list: "matched your list", note: "matched a note", capture: "matched a capture" };

function itemParts(i: Item, idx: Index): [string, string][] {
  const parts: [string, string][] = [
    ["title", i.title],
    ["person", i.creator ?? ""],
    ["list", i.tags.join(" ")],
  ];
  for (const l of idx.logsByItem.get(i.id) ?? []) parts.push(["note", [l.note, l.detail].filter(Boolean).join(" ")]);
  for (const c of idx.capsByItem.get(i.id) ?? []) parts.push(["capture", [c.body, c.who, c.note].filter(Boolean).join(" ")]);
  return parts;
}

const words = (q: string) => normalize(q).split(" ").filter(Boolean);

export function searchItems(q: string, items: Item[], idx: Index): Hit[] {
  const ws = words(q);
  if (!ws.length) return [];
  const out: Hit[] = [];
  for (const item of items) {
    const parts = itemParts(item, idx).map(([k, v]) => [k, normalize(v)] as const);
    const all = parts.map((p) => p[1]).join(" ");
    if (!ws.every((w) => all.includes(w))) continue;
    // Say where it matched when it was not the title, so a note hit is not a mystery.
    // Prefer the field holding every word; a word shared with a list name shouldn't win.
    const rest = parts.filter(([k]) => k !== "title");
    const where = ws.every((w) => parts[0][1].includes(w))
      ? null
      : (rest.find(([, v]) => ws.every((w) => v.includes(w))) ?? rest.find(([, v]) => ws.some((w) => v.includes(w))))?.[0] ?? null;
    out.push({ item, why: where });
  }
  return out;
}

export function searchCaptures(q: string, caps: Capture[], idx: Index): Capture[] {
  const ws = words(q);
  if (!ws.length) return [];
  return caps.filter((c) => {
    const t = normalize([c.body, c.who, c.source, c.note, attribution(c, idx)].filter(Boolean).join(" "));
    return ws.every((w) => t.includes(w));
  });
}

export function SearchBox({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  return (
    <div className="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </svg>
      <input
        className="input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQ("")}
        placeholder="Search"
        aria-label="Search everything"
        enterKeyHint="search"
      />
    </div>
  );
}

const byTitle = (a: Item, b: Item) => a.title.localeCompare(b.title);

export function ItemRow({ item: i, meta }: { item: Item; meta?: React.ReactNode }) {
  const { openItem } = useApp();
  return (
    <button className={`rrow ${i.type === "podcast" || i.type === "music" ? "sq" : ""}`} onClick={() => openItem(i.id)} style={hueStyle(i.type)}>
      <Cover item={i} tiny />
      <div>
        <b>{i.title}</b>
        {meta && <small>{meta}</small>}
      </div>
      {/* Most of what you keep is Love, so only the higher tiers earn a badge. */}
      {(i.tier === "top" || i.tier === "fave") && <TierBadge tier={i.tier} />}
    </button>
  );
}

export function SearchResults({ q }: { q: string }) {
  const { state, idx, openItem, openAdd, types } = useApp();
  const items = searchItems(q, state.items, idx).sort((a, b) => byTitle(a.item, b.item));
  const caps = searchCaptures(q, state.captures, idx);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return (
    <>
      <div className="viewhead">
        <h1>Search</h1>
        <span className="sub">
          {plural(items.length, "item")}, {plural(caps.length, "capture")} for “{q.trim()}”
        </span>
      </div>
      {types.map((t: MediaType) => {
        const rows = items.filter((h) => h.item.type === t);
        if (!rows.length) return null;
        return (
          <section key={t}>
            <div className="tierhead">
              {/* The hue is a swatch, never text color: bright lime or teal text is unreadable on white. */}
              <h2>
                <span className="sw" style={{ background: hue(t), marginRight: 10, verticalAlign: 3 }} />
                {TYPE_NAV[t]}
              </h2>
              <span>{rows.length}</span>
            </div>
            <div className="roster">
              {rows.map(({ item, why }) => (
                <ItemRow key={item.id} item={item} meta={why ? WHY[why] : item.creator} />
              ))}
            </div>
          </section>
        );
      })}
      {caps.length > 0 && (
        <section>
          <div className="tierhead">
            <h2>Shiny things</h2>
            <span>{caps.length}</span>
          </div>
          <div className="capgrid">
            {caps.map((c) => (
              <button
                key={c.id}
                className={`cap ${c.kind}`}
                style={hueStyle(captureType(c, idx))}
                onClick={() => (c.itemId && !isMark(c) ? openItem(c.itemId) : openAdd({ mode: "capture", captureId: c.id }))}
              >
                <p>{isMark(c) ? `To finish: ${markLine(c)}` : c.body}</p>
                <small>{attribution(c, idx)}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {!items.length && !caps.length && <p className="empty">Nothing matches “{q.trim()}”. Search looks at titles, people, your list names, notes and captures.</p>}
    </>
  );
}
