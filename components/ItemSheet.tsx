"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREATOR_ONE,
  FINISH_VERB,
  isAlbum,
  isFollowed,
  KIND_NAME,
  QUEUES,
  QUEUE_NAME,
  STREAM_QUEUES,
  STREAM_TYPES,
  TYPE_ONE,
  libbySearchUrl,
  type CaptureKind,
  type Queue,
} from "@/lib/config";
import type { Capture, Item } from "@/lib/types";
import { useApp } from "./App";
import { ServicePicker, TierPicker, tierFields, type TierPick } from "./Pickers";
import { Cover, TypeTag } from "./bits";
import { againLabel, api, draft, fmtDay, fmtWhen, isMark, markLine, statusLabel, whereYouAre } from "./client";
import { CapLink } from "./CapturesView";
import { useSoon } from "./ComingSoon";
import { Sheet } from "./Sheet";
import { FollowStatus, OrderField, SoonField, TvStatus, TvWhere, WatchWithField, whereMsg } from "./item/AboutFields";
import { EditItem, PickWork } from "./item/EditItem";
import { LogForm, LogRow, LogText, logDraft } from "./item/LogForm";
import { soonLine } from "@/lib/soon";

export function ItemSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { idx, run, toast, openAdd, watchLabel, state } = useApp();
  const item = idx.items.get(id)!;
  const logs = [...(idx.logsByItem.get(id) ?? [])].reverse();
  const caps = idx.capsByItem.get(id) ?? [];
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("about");
  const [logging, setLogging] = useState(false);
  // A half-typed finish left by a reload opens again where it was. After mount: the server renders
  // this sheet too (an open item is in the URL) and can't see the browser's drafts.
  useEffect(() => {
    if (draft.get(logDraft(id))) {
      setTab("history");
      setLogging(true);
    }
  }, [id]);
  const [progress, setProgress] = useState(item.progress ?? "");
  // The value last sent, so leaving the box and tapping Save don't save twice, and closing mid-save doesn't ask.
  const [sentProgress, setSentProgress] = useState<string | null>(null);
  const progressDirty = progress !== (item.progress ?? "") && progress !== sentProgress;
  // Each open form reports unsaved changes here, so closing the sheet asks before throwing them away.
  const [dirtyForms, setDirtyForms] = useState<Record<string, boolean>>({});
  const markDirty = useCallback((key: string, d: boolean) => setDirtyForms((m) => (Boolean(m[key]) === d ? m : { ...m, [key]: d })), []);
  const dirty = Object.values(dirtyForms).some(Boolean) || progressDirty;

  const patch = (body: Partial<Item>, msg?: string) => run(() => api(`/api/items/${id}`, { method: "PATCH", body }), msg);
  // Saves on return, on leaving the box, or on Save. A failed save leaves it unsaved, so closing still asks.
  async function saveProgress() {
    if (!progressDirty) return;
    setSentProgress(progress);
    if (!(await patch({ progress: progress || null }, "Progress saved"))) setSentProgress(null);
  }
  const setTier = (v: TierPick) => patch(tierFields(v), v === "nope" ? "Moved to Not a Fan" : v ? "Tier saved" : "Tier cleared");
  const setQueue = (q: Queue | null) => patch({ queue: q }, q ? `Moved to ${QUEUE_NAME[q]}` : "Taken out of the queue");

  async function remove() {
    const r = await run(() => api(`/api/items/${id}`, { method: "DELETE" }));
    if (!r) return;
    onClose();
    toast(`Deleted ${item.title}`, {
      action: { label: "Undo", fn: () => run(() => api("/api/restore", { body: { kind: "item", id } }), "Restored") },
    });
  }

  const n = logs.length;
  const verb = FINISH_VERB[item.type];
  const followed = isFollowed(item);
  // Albums are kept with a tier and captures; nobody logs a listen.
  const album = isAlbum(item);
  const tv = item.type === "tv";
  // Followed things, albums and shows have nothing to log (shows go by seasons seen).
  const logless = followed || album || tv;
  const logWord = n === 0 ? `Log it as ${verb.toLowerCase()}` : `Log a ${(againLabel(item.type, 2) ?? "").toLowerCase()}`;
  // History's form, from wherever the button sits.
  const startLog = () => {
    setTab("history");
    setLogging(true);
  };
  const standing = statusLabel(item);
  // Finishes only mean something for things you finish; followed things and shows say where you stand.
  const headline = followed || album
    ? standing ?? (item.queue ? QUEUE_NAME[item.queue] : null)
    : tv
      ? [standing, whereYouAre(item)].filter(Boolean).join(" · ") || null
      : n === 0
        ? "Not finished yet"
        : n === 1
          ? `${verb} once`
          : `${verb} ${n} times`;

  // The next episode or season, for the header (hidden ones still show on the About tab).
  const air = useSoon().find((e) => e.item.id === id);

  // One capture, as the Captures tab lists it; About leads with the newest the same way.
  const capRow = (c: Capture) => (
    <div key={c.id}>
      <button className="q" style={{ textAlign: "left", "--hue": `var(--${item.type})` } as React.CSSProperties} onClick={() => openAdd({ mode: "capture", captureId: c.id })}>
        {isMark(c) ? `To finish: ${markLine(c)}` : c.kind === "quote" ? `“${c.body}”` : c.body}
        <small>
          {[KIND_NAME[c.kind as CaptureKind] ?? c.kind, isMark(c) ? null : c.detail, isMark(c) || !c.time ? null : `at ${c.time}`, c.who, c.capturedOn ? fmtDay(c.capturedOn) : null]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </button>
      {c.url && !isMark(c) && <CapLink url={c.url} />}
    </div>
  );

  const capturesField = (
    <div className="field">
      {caps.map(capRow)}
      {followed && !caps.length && <p className="hint">Nothing captured from it yet.</p>}
      <button className={`btn ${followed ? "" : "ghost"}`} onClick={() => openAdd({ mode: "capture", itemId: id })}>
        {item.type === "podcast" || tv ? "+ Capture from an episode" : item.type === "music" ? "+ Capture from a track" : "+ Capture from this"}
      </button>
    </div>
  );

  // Not built for logless things: their earlier finishes are listed on their own, and they have no "again" word.
  const historyField = logless ? null : (
    <div className="field">
      {logging ? (
        <LogForm itemId={id} again={n > 0} type={item.type} rated={item} done={() => setLogging(false)} onDirty={(d) => markDirty("new-log", d)} />
      ) : (
        <button className="btn" onClick={() => setLogging(true)}>
          {logWord}
        </button>
      )}
      <div className="loglist">
        {logs.map((l, k) => (
          <LogRow key={l.id} log={l} label={againLabel(item.type, n - k)} onDirty={(d) => markDirty(`log-${l.id}`, d)} />
        ))}
      </div>
      {n === 0 && !logging && (
        <p className="hint">Nothing logged yet. Each finish is its own entry, so {item.type === "book" ? "rereads" : "rewatches"} never overwrite.</p>
      )}
    </div>
  );

  const progressInput = (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        className="input"
        value={progress}
        onChange={(e) => setProgress(e.target.value)}
        onBlur={saveProgress}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        enterKeyHint="done"
        placeholder={item.type === "book" ? "Where you are: p. 212" : "Where you are"}
        aria-label="Progress"
      />
      {progressDirty && (
        <button className="btn small" onClick={saveProgress}>
          Save
        </button>
      )}
    </div>
  );

  // Queue chips. Shows track Watching above, so their chips leave out In Progress; a show being
  // watched gets no Queue row at all (see watchingOrder), so "Not queued" here is always true.
  const queueChoices = tv ? QUEUES.filter((q) => q !== "in_progress") : QUEUES;
  const queueField = (
    <>
    <div className="field">
      <span>Queue</span>
      <div className="chips" role="radiogroup" aria-label="Queue section">
        <button role="radio" aria-checked={!item.queue} className={`chip ${!item.queue ? "on" : ""}`} onClick={() => item.queue && setQueue(null)}>
          Not queued
        </button>
        {queueChoices.map((q) => (
          <button key={q} role="radio" aria-checked={item.queue === q} className={`chip ${item.queue === q ? "on" : ""}`} onClick={() => item.queue !== q && setQueue(q)}>
            {QUEUE_NAME[q]}
          </button>
        ))}
      </div>
      {!tv && item.queue && STREAM_TYPES.includes(item.type) && STREAM_QUEUES.includes(item.queue) && (
        <ServicePicker value={item.watchOn} theater={item.type === "movie"} onChange={(v) => patch({ watchOn: v }, whereMsg(v))} />
      )}
      {!tv && item.queue === "in_progress" && progressInput}
    </div>
    <OrderField item={item} />
    </>
  );
  // A show being watched: Where you are already says Watching, and a Queue row under it lit "Not queued"
  // beside "5 of 5". So no Queue row, and the Order row says which list it means.
  // Up Next and Saved for Later come back with the Queue row once Where you are is no longer Watching.
  const watchingOrder = <OrderField item={item} label="Order in Watching" />;

  // About leads with what was last said about it: the newest finish, then the newest capture. With
  // neither, About is as it was. Tier follows them, so it moves up with them.
  const lead = n > 0 || caps.length > 0;
  const lastTime = n > 0 && (
    <div className="field">
      <span>Last time</span>
      <div className="lastlog">
        <LogText log={logs[0]} label={againLabel(item.type, n)} />
      </div>
      {(!logless || n > 1) && (
        <div className="lastmore">
          {/* Logless things (shows, followed things, albums) keep their earlier entries and offer no button, as on History. */}
          {!logless && (
            <button className="btn" onClick={startLog}>
              {logWord}
            </button>
          )}
          {n > 1 && (
            <button className="linkbtn" onClick={() => setTab("history")}>
              All {n} in History
            </button>
          )}
        </div>
      )}
    </div>
  );
  const shiny = caps.length > 0 && (
    <div className="field">
      <span>Shiny things</span>
      {capRow(caps[0])}
      {caps.length > 1 && (
        <div className="lastmore">
          <button className="linkbtn" onClick={() => setTab("captures")}>
            All {caps.length} in Captures
          </button>
        </div>
      )}
    </div>
  );
  const tierRow = <TierPicker tier={item.tier} disliked={item.disliked} onPick={setTier} />;
  // Books and authors: one chip per library, each a Libby search in a new tab. A row on About, placed
  // as Where to watch is on a show (in the header the links wrapped badly on the phone).
  const libbyRow = item.type === "book" && state.libby.length > 0 && (
    <div className="field libby">
      <span>Find in Libby</span>
      <div className="chips">
        {state.libby.map((l) => (
          <a key={l.key} className="chip" href={libbySearchUrl(l.key, item)} target="_blank" rel="noopener noreferrer">
            {l.name}
          </a>
        ))}
      </div>
    </div>
  );

  // The with-someone tag has its own chips above.
  const shownTags = item.tags.filter((t) => t !== watchLabel);

  // History shows only when earlier finishes exist.
  const tabs: Tab[] = logless ? (n > 0 ? ["about", "captures", "history"] : ["about", "captures"]) : ["about", "captures", "history"];
  const count: Partial<Record<Tab, number>> = { captures: caps.length, history: n };

  const top = (
    <>
      <div className="ihero">
        <Cover item={item} />
        <div className="ihero-text">
          <TypeTag item={item} />
          <h3>{item.title}</h3>
          {/* A podcast's year is its newest episode's date from the lookup, so it stays out of the header (the data is kept). */}
          <div className="mt">
            {[item.creator, item.type === "podcast" ? null : item.year].filter(Boolean).join(" · ") || (item.entity === "creator" ? CREATOR_ONE[item.type] : "")}
          </div>
          {headline && <div className="mt">{headline}</div>}
          {air && <div className="inext">{soonLine(air, fmtWhen)}</div>}
          <button
            className="linkbtn ihero-edit"
            onClick={() => {
              setEditing(!editing);
              setTab("about");
            }}
          >
            {editing ? "Close editing" : "Edit details or cover"}
          </button>
        </div>
      </div>
      <div className="itabs" role="tablist" aria-label={`${item.title}: sections`}>
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {TAB_NAME[t]}
            {t !== "about" && <span>{count[t]}</span>}
          </button>
        ))}
      </div>
    </>
  );

  // Every tab stays mounted (hidden when not picked), so a half-typed finish or edit survives a tab switch.
  return (
    <Sheet
      title={TYPE_ONE[item.type]}
      onClose={onClose}
      onDiscard={() => draft.set(logDraft(id), null)}
      side
      label={item.title}
      dirty={dirty}
      top={top}
      className="isheet"
    >
      <div className="ipanel" role="tabpanel" hidden={tab !== "about"}>
        {/* Artists and authors are followed in their own right and never need a pick. */}
        {item.entity === "creator" && !followed && !editing && (
          <div className="banner">
            <div>
              This is a name from your old list, not a specific {TYPE_ONE[item.type].toLowerCase()} yet. Pick one and this entry becomes it, keeping its tier.
            </div>
            <PickWork item={item} />
          </div>
        )}

        {editing && <EditItem item={item} done={() => setEditing(false)} onDirty={(d) => markDirty("edit", d)} />}

        {lastTime}
        {shiny}
        {lead && tierRow}

        {followed || album ? (
          <>
            {followed && <FollowStatus item={item} patch={patch} />}
            {libbyRow}
            {!lead && tierRow}
            {item.queue && queueField}
          </>
        ) : tv ? (
          <>
            <TvStatus item={item} patch={patch} />
            <SoonField item={item} />
            <TvWhere item={item} patch={patch} />
            <WatchWithField item={item} patch={patch} />
            {!lead && tierRow}
            {item.queue === "in_progress" ? watchingOrder : queueField}
          </>
        ) : (
          <>
            {item.type === "movie" && <SoonField item={item} />}
            {item.type === "movie" && <WatchWithField item={item} patch={patch} />}
            {libbyRow}
            {!lead && tierRow}
            {queueField}
            {/* Finishing something queued is the usual reason to open it, so the button sits here too
                and opens History's form. Once it has a finish, Last time carries it. */}
            {item.queue && item.entity !== "creator" && n === 0 && (
              <button className="btn" onClick={startLog}>
                {logWord}
              </button>
            )}
          </>
        )}

        {(item.origin || shownTags.length > 0) && (
          <div className="origin">
            {item.origin && <div>Imported from {item.origin}</div>}
            {shownTags.length > 0 && <div>Tags: {shownTags.join(", ")}</div>}
          </div>
        )}

        <button className="btn danger" onClick={remove}>
          Delete {item.title}
        </button>
      </div>

      <div className="ipanel" role="tabpanel" hidden={tab !== "captures"}>
        {capturesField}
      </div>

      {tabs.includes("history") && (
        <div className="ipanel" role="tabpanel" hidden={tab !== "history"}>
          {logless ? (
            // Earlier finishes stay visible; there's no button to log a listen or a season.
            <div className="loglist">
              {logs.map((l, k) => (
                <LogRow key={l.id} log={l} label={againLabel(item.type, n - k)} onDirty={(d) => markDirty(`log-${l.id}`, d)} />
              ))}
            </div>
          ) : (
            historyField
          )}
        </div>
      )}
    </Sheet>
  );
}

type Tab = "about" | "captures" | "history";
const TAB_NAME: Record<Tab, string> = { about: "About", captures: "Captures", history: "History" };
