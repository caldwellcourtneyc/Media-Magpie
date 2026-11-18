"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CREATOR_ONE,
  FINISH_VERB,
  MEDIA_TYPES,
  typesInOrder,
  QUEUES,
  QUEUE_NAME,
  STREAM_QUEUES,
  STREAM_TYPES,
  TYPE_ONE,
  isFollowed,
  type MediaType,
  type Queue,
  type Tier,
} from "@/lib/config";
import type { Item, Log, LookupResult } from "@/lib/types";
import { networkService } from "@/lib/where";
import { useApp } from "./App";
import { Cover, hueStyle } from "./bits";
import { api, draft, isMark, normalize, today } from "./client";
import { CaptureForm } from "./CaptureForm";
import { ServicePicker, TierPicker, tierFields } from "./Pickers";
import { useLookup } from "./useLookup";
import { Sheet } from "./Sheet";

export type AddMode = "finished" | "queue" | "follow" | "capture";
/** Queue first: deciding what's next is the most common add. Same order here and in the desk rail. */
export const MODES: AddMode[] = ["queue", "finished", "follow", "capture"];
export const MODE_NAME: Record<AddMode, string> = { finished: "Finished", queue: "Queue", follow: "Follow", capture: "Shiny things" };
/** Podcasts and music are followed, never finished; shows can be either. Shown in your order of types (typesInOrder). */
export const MODE_TYPES: Record<Exclude<AddMode, "capture">, readonly MediaType[]> = {
  finished: ["tv", "movie", "book"],
  queue: MEDIA_TYPES,
  // Music and book here mean the artist or author, not an album or a book.
  follow: ["podcast", "music", "book", "tv"],
};
/** How an add starts: which tab, on what item or capture, with which type, and (for Queue) in which section. */
export type AddOpts = { mode?: AddMode; itemId?: string; type?: MediaType; captureId?: string; queue?: Queue };

type Chosen = { kind: "existing"; item: Item } | { kind: "lookup"; r: LookupResult } | null;

const LAST_TYPE = "ml-last-type";
const LAST_MODE = "ml-last-mode";
/** A new capture's words, kept until saved or thrown away (the desk rail keeps its own). */
const DRAFT = "ml-sheet-draft";
function remembered<T extends string>(key: string, ok: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key) as T;
    return ok.includes(v) ? v : null;
  } catch {
    return null;
  }
}
function remember(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* convenience only */
  }
}

export function AddSheet({ opts, onClose }: { opts: AddOpts; onClose: () => void }) {
  const { state, idx, filter, types } = useApp();
  const preItem = opts.itemId ? idx.items.get(opts.itemId) ?? null : null;
  const editing = opts.captureId ? state.captures.find((c) => c.id === opts.captureId) ?? null : null;
  // A new capture of its own (not an edit, not from an item) keeps a draft; one waiting opens the sheet on it.
  const drafted = !editing && !preItem;
  const [mode, setMode] = useState<AddMode>(
    editing ? "capture" : opts.mode ?? (drafted && draft.get(DRAFT) ? "capture" : null) ?? remembered<AddMode>(LAST_MODE, MODES) ?? "queue"
  );
  const [type, setType] = useState<MediaType>(
    preItem?.type ?? opts.type ?? (filter !== "all" ? filter : null) ?? remembered<MediaType>(LAST_TYPE, MEDIA_TYPES) ?? "book"
  );
  const [dirty, setDirty] = useState(false);
  // A type the mode doesn't offer (a podcast in Finished) falls back to the mode's first type.
  const allowed = typesInOrder(types, mode === "capture" ? MEDIA_TYPES : MODE_TYPES[mode]);
  const shownType = preItem || allowed.includes(type) ? type : allowed[0];

  const title = editing
    ? isMark(editing)
      ? "Finish this"
      : "Edit capture"
    : mode === "capture"
      ? "Capture"
      : mode === "queue"
        ? "Add to queue"
        : mode === "follow"
          ? "Follow something"
          : "Log a finish";
  return (
    <Sheet
      title={title}
      onClose={onClose}
      dirty={dirty}
      onDiscard={() => drafted && mode === "capture" && draft.set(DRAFT, null)}
      label={title}
      className="addsheet"
    >
      {!editing && !preItem && (
        <div className="seg seg4 addtabs" role="tablist" aria-label="What are you adding">
          {MODES.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "on" : ""}
              onClick={() => {
                setMode(m);
                remember(LAST_MODE, m);
              }}
            >
              {MODE_NAME[m]}
            </button>
          ))}
        </div>
      )}
      {mode === "capture" ? (
        <CaptureForm
          key="capture"
          preItem={preItem}
          editing={editing}
          defaultType={opts.type ?? null}
          onDone={onClose}
          setDirty={setDirty}
          draft={drafted ? DRAFT : undefined}
        />
      ) : (
        <ItemForm
          key={mode}
          mode={mode}
          types={allowed}
          type={shownType}
          setType={(t) => {
            setType(t);
            remember(LAST_TYPE, t);
          }}
          preItem={preItem}
          onDone={onClose}
          setDirty={setDirty}
          startQueue={opts.queue}
        />
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- finished / queue

export function ItemForm({
  mode,
  types,
  type,
  setType,
  preItem,
  onDone,
  setDirty,
  focus = true,
  startQueue,
}: {
  mode: "finished" | "queue" | "follow";
  types: readonly MediaType[];
  type: MediaType;
  setType: (t: MediaType) => void;
  preItem: Item | null;
  onDone: () => void;
  setDirty: (d: boolean) => void;
  /** False in the desk rail until you pick a tab, so loading the page never grabs focus or pops a keyboard. */
  focus?: boolean;
  /** The section the Queue tab starts on; Up Next when not said. */
  startQueue?: Queue;
}) {
  const { state, run, toast, reload } = useApp();
  const [chosen, setChosen] = useState<Chosen>(preItem ? { kind: "existing", item: preItem } : null);
  const [q, setQ] = useState("");
  const [creator, setCreator] = useState("");
  const [year, setYear] = useState("");
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "pick" | "none">("today");
  const [showDates, setShowDates] = useState(false);
  const [picked, setPicked] = useState(today());
  const [detail, setDetail] = useState("");
  const [note, setNote] = useState("");
  const [tier, setTier] = useState<Tier | null>(preItem?.tier ?? null);
  const [disliked, setDisliked] = useState(preItem?.disliked ?? false);
  const [queue, setQueue] = useState<Queue>(startQueue ?? "up_next");
  const [watchOn, setWatchOn] = useState<string[]>(preItem?.watchOn ?? []);
  const showWhere = mode === "queue" && STREAM_TYPES.includes(type) && STREAM_QUEUES.includes(queue);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDirty(Boolean(q.trim() || note.trim() || detail.trim())), [q, note, detail, setDirty]);

  // Following an artist or author adds the person, not an album or book, so the title lookup
  // (which finds works) is skipped and only your own entries are suggested.
  const person = mode === "follow" && (type === "music" || type === "book");

  // The provider's matches for what's typed, while nothing is picked.
  const { results, state: lookupState, provider } = useLookup(type, q, !chosen && !person);

  const local = useMemo(() => {
    const n = normalize(q);
    if (chosen || n.length < 2) return [];
    return state.items.filter((i) => i.type === type && (!person || i.entity === "creator") && normalize(i.title).includes(n)).slice(0, 4);
  }, [q, type, chosen, state.items, person]);

  const finishedOn = dateMode === "today" ? today() : dateMode === "yesterday" ? today(-1) : dateMode === "pick" ? picked || null : null;
  const canSave = Boolean(chosen || q.trim());
  const verb = FINISH_VERB[type];

  /**
   * A typed title that matches something you already have (same type, same title) means that item,
   * so history, tier and captures stay on one entry. A lookup pick of a different work with the same
   * title (two different shows that share a name) is a new item.
   */
  function alreadyHave(): Item | null {
    const title = chosen?.kind === "lookup" ? chosen.r.title : q.trim();
    const n = normalize(title);
    if (!n) return null;
    // Following an artist matches your artist entry, not an album that shares the name.
    const hit = state.items.find((i) => i.type === type && (!person || i.entity === "creator") && normalize(i.title) === n);
    if (!hit || chosen?.kind !== "lookup") return hit ?? null;
    const sameWork = !hit.lookupId || (hit.lookupSource === chosen.r.source && hit.lookupId === chosen.r.sourceId);
    return sameWork ? hit : null;
  }

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const log = { finishedOn, detail: detail || null, note: note || null };
      const it = chosen?.kind === "existing" ? chosen.item : alreadyHave();
      if (it) {
        const picked = chosen?.kind === "existing";
        const same = picked ? "" : " (the one already in your log)";
        // Picking it from "In your log" loads its tier and services into the form, so any difference is
        // your change. Matched by a typed title, the form starts blank: only what you set here applies.
        const tierChanged = picked ? tier !== it.tier : tier !== null && tier !== it.tier;
        // Not a Fan and a tier exclude each other: picking either one settles both.
        const verdict =
          (picked ? disliked !== it.disliked : disliked && !it.disliked) ? tierFields(disliked ? "nope" : tier) : tierChanged ? tierFields(tier) : null;
        const sendWhere = showWhere && (picked || watchOn.length > 0);
        if (mode === "finished") {
          const r = await api<{ log: Log }>(`/api/items/${it.id}/logs`, { body: log });
          // The finish is saved; a failed tier change must not read as a failed log, or a retry logs it twice.
          let tierFailed = false;
          if (verdict) await api(`/api/items/${it.id}`, { method: "PATCH", body: verdict }).catch(() => (tierFailed = true));
          await reload();
          toast(tierFailed ? `Logged ${it.title}, but the tier didn't save. Set it on the item.` : `Logged ${it.title}${same}`, {
            bad: tierFailed,
            action: { label: "Undo", fn: () => run(() => api(`/api/logs/${r.log.id}`, { method: "DELETE" }), "Undone") },
          });
        } else if (mode === "follow") {
          // Following replaces a try-it-later spot in the queue; In Progress stays (a show you're watching).
          const leaveQueue = it.queue === "up_next" || it.queue === "saved";
          await api(`/api/items/${it.id}`, { method: "PATCH", body: { status: "following", ...(leaveQueue ? { queue: null } : {}) } });
          await reload();
          toast(`Following ${it.title}${same}`);
        } else {
          await api(`/api/items/${it.id}`, {
            method: "PATCH",
            body: { queue, ...(verdict ?? {}), ...(sendWhere ? { watchOn } : {}) },
          });
          await reload();
          toast(`${it.title}${same} is in ${QUEUE_NAME[queue]}`);
        }
      } else {
        const base =
          chosen?.kind === "lookup"
            ? {
                title: chosen.r.title,
                creator: chosen.r.creator,
                year: chosen.r.year,
                coverUrl: chosen.r.coverUrl,
                lookupSource: chosen.r.source,
                lookupId: chosen.r.sourceId,
              }
            : person
              ? { title: q.trim(), entity: "creator" as const }
              : { title: q.trim(), creator: creator.trim() || null, year: /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : null };
        const how =
          mode === "queue" ? { queue, ...(showWhere ? { watchOn } : {}) } : mode === "follow" ? { status: "following" as const } : { log };
        const body = { type, ...base, ...(mode === "follow" ? {} : { tier, disliked }), ...how };
        const r = await api<{ item: Item }>("/api/items", { body });
        await reload();
        const said = mode === "finished" ? `Logged ${r.item.title}` : mode === "follow" ? `Following ${r.item.title}` : `${r.item.title} is in ${QUEUE_NAME[queue]}`;
        toast(said, {
          action: { label: "Undo", fn: () => run(() => api(`/api/items/${r.item.id}`, { method: "DELETE" }), "Undone") },
        });
      }
      setDirty(false);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", { bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!preItem && (
        <div className="chips" role="radiogroup" aria-label="Type">
          {types.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={type === t}
              className={`chip type ${type === t ? "on" : ""}`}
              style={hueStyle(t)}
              onClick={() => {
                setType(t);
                if (chosen?.kind === "lookup") setChosen(null);
              }}
            >
              <span className="sw" style={{ background: `var(--${t})` }} />
              {mode === "follow" && (t === "music" || t === "book") ? CREATOR_ONE[t] : TYPE_ONE[t]}
            </button>
          ))}
        </div>
      )}

      {chosen ? (
        <div className="picked">
          <Cover item={chosen.kind === "existing" ? chosen.item : { title: chosen.r.title, type, coverUrl: chosen.r.coverUrl, entity: "work" }} />
          <div style={{ minWidth: 0 }}>
            <b>{chosen.kind === "existing" ? chosen.item.title : chosen.r.title}</b>
            <small>
              {chosen.kind === "existing"
                ? [
                    chosen.item.creator,
                    mode === "finished" && state.logs.some((l) => l.itemId === chosen.item.id) ? "already in your log: this adds another finish" : "already in your log",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : [chosen.r.creator, type === "podcast" ? null : chosen.r.year].filter(Boolean).join(" · ")}
            </small>
          </div>
          {!preItem && (
            <button
              className="linkbtn"
              onClick={() => {
                setChosen(null);
                setTier(null);
              }}
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <div className="field">
          <span>{person ? "Name" : "Title"}</span>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={person ? `${CREATOR_ONE[type]}'s name` : `Search ${type === "tv" ? "TV" : TYPE_ONE[type].toLowerCase()} titles, or type your own`}
            autoFocus={focus}
            data-autofocus={focus || undefined}
            enterKeyHint="search"
            autoComplete="off"
          />
          {(local.length > 0 || results.length > 0 || lookupState !== "idle") && (
            <div className="results">
              {local.length > 0 && <div className="rh">In your log</div>}
              {local.map((i) => (
                <button
                  key={i.id}
                  className="res"
                  onClick={() => {
                    setChosen({ kind: "existing", item: i });
                    setWatchOn(i.watchOn);
                    setTier(i.tier);
                    setDisliked(i.disliked);
                  }}
                >
                  <Cover item={i} tiny />
                  <span>
                    <b>{i.title}</b>
                    <small>{[i.creator, i.entity === "creator" ? (isFollowed(i) ? CREATOR_ONE[i.type] : "needs a pick") : null].filter(Boolean).join(" · ")}</small>
                  </span>
                  {/* What picking it will do, so it reads as the action: an ink pill, in the button's own words. */}
                  <span className="act">
                    {mode === "queue" ? "Queue it" : mode === "follow" ? "Follow it" : state.logs.some((l) => l.itemId === i.id) ? "Log again" : "Log it"}
                  </span>
                </button>
              ))}
              {results.length > 0 && <div className="rh">From {provider}</div>}
              {results.map((r) => (
                <button key={r.source + r.sourceId} className="res" onClick={() => setChosen({ kind: "lookup", r })}>
                  <Cover item={{ title: r.title, type, coverUrl: r.coverUrl, entity: "work" }} tiny />
                  <span>
                    <b>{r.title}</b>
                    {/* A podcast's year from the lookup is its newest episode's date, which says nothing about it. */}
                    <small>{[r.creator, type === "podcast" ? null : r.year, r.extra].filter(Boolean).join(" · ")}</small>
                  </span>
                </button>
              ))}
              {lookupState === "loading" && <p className="hint">Looking it up…</p>}
              {lookupState === "error" && <p className="hint">Lookup is not answering right now. Type the title yourself; you can add a cover later.</p>}
              {lookupState === "done" && results.length === 0 && local.length === 0 && <p className="hint">No matches. It saves as you typed it.</p>}
            </div>
          )}
          {q.trim() && !person && (
            <div className="row2">
              <label className="field">
                <span>{type === "book" ? "Author" : type === "music" ? "Artist" : type === "movie" ? "Director" : type === "podcast" ? "Host or network" : "Network"}</span>
                <input className="input" value={creator} onChange={(e) => setCreator(e.target.value)} autoComplete="off" />
              </label>
              <label className="field">
                <span>Year</span>
                <input className="input" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" maxLength={4} />
              </label>
            </div>
          )}
        </div>
      )}

      {mode === "finished" ? (
        <>
          <div className="field">
            <span>When</span>
            {/* The date defaults to today and stays out of the way; it rarely matters to you. */}
            {dateMode === "today" && !showDates ? (
              <div className="dateline">
                Today
                <button className="linkbtn" onClick={() => setShowDates(true)}>
                  Change
                </button>
              </div>
            ) : (
            <div className="datechips">
              {(["today", "yesterday"] as const).map((d) => (
                <button key={d} className={`chip ${dateMode === d ? "on" : ""}`} onClick={() => setDateMode(d)}>
                  {d === "today" ? "Today" : "Yesterday"}
                </button>
              ))}
              <button className={`chip ${dateMode === "pick" ? "on" : ""}`} onClick={() => setDateMode("pick")}>
                Pick a date
              </button>
              <button className={`chip ${dateMode === "none" ? "on" : ""}`} onClick={() => setDateMode("none")}>
                No date
              </button>
              {dateMode === "pick" && <input type="date" className="input" value={picked} max={today()} onChange={(e) => setPicked(e.target.value)} aria-label="Date finished" />}
            </div>
            )}
          </div>
          <label className="field">
            <span>{type === "tv" ? "Season or episode (optional)" : type === "podcast" ? "Episode (optional)" : "Detail (optional)"}</span>
            <input
              className="input"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={type === "tv" ? "Season 2" : type === "podcast" ? "The one with…" : type === "book" ? "Audiobook, reread…" : ""}
            />
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What stuck with you?" />
          </label>
        </>
      ) : mode === "follow" ? (
        <p className="hint">
          {type === "tv"
            ? "For a show you keep up with between seasons. It shows as caught up and waiting, ready to queue when a new season lands."
            : person
              ? `For ${type === "music" ? "an artist" : "an author"} you keep up with. Albums and books you love can still be added on their own.`
              : "For a podcast you keep up with. No dates and no finishes: capture what stays with you instead."}
        </p>
      ) : (
        <div className="field">
          <span>Section</span>
          <div className="chips" role="radiogroup" aria-label="Queue section">
            {QUEUES.map((qq) => (
              <button key={qq} role="radio" aria-checked={queue === qq} className={`chip ${queue === qq ? "on" : ""}`} onClick={() => setQueue(qq)}>
                {QUEUE_NAME[qq]}
              </button>
            ))}
          </div>
        </div>
      )}

      {showWhere && <ServicePicker value={watchOn} onChange={setWatchOn} theater={type === "movie"} auto={type === "tv" ? networkService(chosen?.kind === "lookup" ? chosen.r.creator : chosen?.kind === "existing" ? chosen.item.creator : creator) : null} />}

      {mode !== "follow" && (
        <TierPicker
          tier={tier}
          disliked={disliked}
          onPick={(v) => {
            const picked = tierFields(v);
            setDisliked(picked.disliked);
            setTier(picked.tier);
          }}
        />
      )}

      <button className="btn wide" style={{ minHeight: 50, fontSize: "var(--fs-body)" }} disabled={!canSave || busy} onClick={save}>
        {busy ? "Saving…" : mode === "finished" ? `Log it as ${verb.toLowerCase()}` : mode === "follow" ? "Follow it" : `Add to ${QUEUE_NAME[queue]}`}
      </button>
    </>
  );
}
