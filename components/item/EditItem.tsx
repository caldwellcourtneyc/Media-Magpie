"use client";

// Edit details or cover, and turning a name from an old list into a specific work, both with a title lookup.
import { useState } from "react";
import type { Item, LookupResult } from "@/lib/types";
import { useApp } from "../App";
import { Cover } from "../bits";
import { api } from "../client";
import { useLookup } from "../useLookup";
import { useReportDirty, type DirtyFn } from "./dirty";

function LookupList({ type, q, onPick }: { type: Item["type"]; q: string; onPick: (r: LookupResult) => void }) {
  const { results, state: st } = useLookup(type, q);
  return (
    <div className="results">
      {results.map((r) => (
        <button key={r.source + r.sourceId} className="res" onClick={() => onPick(r)}>
          <Cover item={{ title: r.title, type, coverUrl: r.coverUrl, entity: "work" }} tiny />
          <span>
            <b>{r.title}</b>
            <small>{[r.creator, type === "podcast" ? null : r.year].filter(Boolean).join(" · ")}</small>
          </span>
        </button>
      ))}
      {st === "loading" && <p className="hint">Looking it up…</p>}
      {st === "error" && <p className="hint">Lookup is not answering right now. You can still edit by hand.</p>}
      {st === "done" && !results.length && <p className="hint">No matches.</p>}
    </div>
  );
}

/** Turn an artist or author entry into a specific work. */
export function PickWork({ item }: { item: Item }) {
  const { run } = useApp();
  const [q, setQ] = useState(item.title);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="btn small" onClick={() => setOpen(true)} style={{ justifySelf: "start" }}>
        Pick {item.type === "music" ? "an album" : "a title"}
      </button>
    );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search" />
      <LookupList
        type={item.type}
        q={q}
        onPick={(r) =>
          run(
            () =>
              api(`/api/items/${item.id}`, {
                method: "PATCH",
                body: { entity: "work", title: r.title, creator: r.creator ?? item.title, year: r.year, coverUrl: r.coverUrl, lookupSource: r.source, lookupId: r.sourceId },
              }),
            `Now ${r.title}`
          )
        }
      />
    </div>
  );
}

export function EditItem({ item, done, onDirty }: { item: Item; done: () => void; onDirty?: DirtyFn }) {
  const { run } = useApp();
  const [title, setTitle] = useState(item.title);
  const [creator, setCreator] = useState(item.creator ?? "");
  const [year, setYear] = useState(item.year ? String(item.year) : "");
  const [cover, setCover] = useState(item.coverUrl ?? "");
  const [search, setSearch] = useState(false);
  const [creatorEntry, setCreatorEntry] = useState(item.entity === "creator");
  const [release, setRelease] = useState(item.releaseOn ?? "");
  const movie = item.type === "movie";
  useReportDirty(
    onDirty,
    title !== item.title ||
      creator !== (item.creator ?? "") ||
      year !== (item.year ? String(item.year) : "") ||
      cover !== (item.coverUrl ?? "") ||
      creatorEntry !== (item.entity === "creator") ||
      release !== (item.releaseOn ?? "")
  );

  async function save() {
    const r = await run(
      () =>
        api(`/api/items/${item.id}`, {
          method: "PATCH",
          body: {
            title,
            creator: creator || null,
            year: /^\d{4}$/.test(year) ? Number(year) : null,
            coverUrl: cover || null,
            entity: creatorEntry ? "creator" : "work",
            ...(movie ? { releaseOn: release || null } : {}),
          },
        }),
      "Saved"
    );
    if (r) done();
  }

  return (
    <div className="subform">
      <label className="field">
        <span>Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="row2">
        <label className="field">
          {/* A show's creator field holds its network (from TVmaze). */}
          <span>{item.type === "tv" ? "Network" : "By"}</span>
          <input className="input" value={creator} onChange={(e) => setCreator(e.target.value)} />
        </label>
        <label className="field">
          <span>Year</span>
          <input className="input" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" maxLength={4} />
        </label>
      </div>
      {/* A movie's release date puts it in Coming soon; a script can fill it in too. */}
      {movie && (
        <label className="field">
          <span>Release date</span>
          <input className="input" type="date" value={release} onChange={(e) => setRelease(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Cover image link</span>
        <input className="input" value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://" inputMode="url" />
      </label>
      <button className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setSearch(!search)}>
        {search ? "Hide cover search" : "Find a cover by title"}
      </button>
      {search && (
        <LookupList
          type={item.type}
          q={title}
          onPick={(r) => {
            setCover(r.coverUrl ?? "");
            if (!creator && r.creator) setCreator(r.creator);
            if (!year && r.year) setYear(String(r.year));
            setSearch(false);
          }}
        />
      )}
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--fs-card)" }}>
        <input type="checkbox" checked={creatorEntry} onChange={(e) => setCreatorEntry(e.target.checked)} />
        This is {item.type === "music" ? "an artist" : item.type === "book" ? "an author" : "a person"}, not a specific work
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={save} disabled={!title.trim()}>
          Save details
        </button>
        <button className="btn ghost" onClick={done}>
          Cancel
        </button>
      </div>
    </div>
  );
}
