"use client";

// Finishes on an item: the form that logs or edits one, and how History and About show them.
import { useEffect, useRef, useState } from "react";
import type { Tier } from "@/lib/config";
import type { Item, Log } from "@/lib/types";
import { useApp } from "../App";
import { api, draft, fmtDay, today } from "../client";
import { TierPicker, tierFields } from "../Pickers";
import { useReportDirty, type DirtyFn } from "./dirty";

/** A new finish's detail and note, kept until it's logged, cancelled or thrown away. */
export const logDraft = (itemId: string) => `ml-log-draft-${itemId}`;

/**
 * A new finish, or (with `log`) an old one being edited. A new finish also offers the tier row, lit as
 * the item stands (`rated`); it saves a tier only when you tap one, and editing an old finish has no tier row.
 */
export function LogForm({
  itemId,
  again,
  type,
  done,
  log,
  rated,
  onDirty,
}: {
  itemId: string;
  again: boolean;
  type: Item["type"];
  done: () => void;
  log?: Log;
  rated?: Pick<Item, "tier" | "disliked">;
  onDirty?: DirtyFn;
}) {
  const { run, toast } = useApp();
  const start = useRef({ date: log ? log.finishedOn ?? "" : today(), detail: log?.detail ?? "", note: log?.note ?? "" }).current;
  // Editing an old finish keeps no draft; its saved version is right there.
  const saved = useRef<{ detail?: string; note?: string }>(log ? {} : readLogDraft(itemId)).current;
  const [date, setDate] = useState<string>(start.date);
  const [showDate, setShowDate] = useState(false);
  const [detail, setDetail] = useState(saved.detail ?? start.detail);
  const [note, setNote] = useState(saved.note ?? start.note);
  useEffect(() => {
    if (!log) draft.set(logDraft(itemId), detail || note ? JSON.stringify({ detail, note }) : null);
  }, [log, itemId, detail, note]);
  const finish = () => {
    if (!log) draft.set(logDraft(itemId), null);
    done();
  };
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Your tap on the tier row, or null while you haven't touched it: untouched, the row follows the item
  // (a tier set on About while this form is open shows here, and is never written back over).
  const [verdict, setVerdict] = useState<Tier | "nope" | "none" | null>(null);
  const was = rated ? (rated.disliked ? "nope" : rated.tier ?? "none") : "none";
  const now = verdict ?? was;
  const tierChanged = Boolean(rated) && now !== was;
  useReportDirty(onDirty, date !== start.date || detail !== start.detail || note !== start.note || tierChanged);
  useEffect(() => {
    if (!log) ref.current?.focus();
  }, [log]);

  async function save() {
    setBusy(true);
    const body = { finishedOn: date || null, detail: detail || null, note: note || null };
    let ok = false;
    if (log) {
      ok = (await run(() => api(`/api/logs/${log.id}`, { method: "PATCH", body }), "Saved")) !== undefined;
    } else {
      // The finish is saved first; a failed tier change must not read as a failed log, or a retry logs it twice.
      const r = await run(async () => {
        const saved = await api<{ log: Log }>(`/api/items/${itemId}/logs`, { body });
        let tierFailed = false;
        if (tierChanged) await api(`/api/items/${itemId}`, { method: "PATCH", body: tierFields(now === "none" ? null : now) }).catch(() => (tierFailed = true));
        return { ...saved, tierFailed };
      });
      if (r) {
        ok = true;
        toast(r.tierFailed ? "Logged, but the tier didn't save. Set it on About." : again ? "Logged again" : "Logged", {
          bad: r.tierFailed,
          action: { label: "Undo", fn: () => run(() => api(`/api/logs/${r.log.id}`, { method: "DELETE" }), "Undone") },
        });
      }
    }
    setBusy(false);
    // A failed save keeps the form open with everything you typed; the toast says why.
    if (ok) finish();
  }

  return (
    <div className="subform">
      {/* A new finish is dated today without asking; editing an old one shows its date. */}
      {!log && !showDate && date === today() ? (
        <div className="dateline">
          Finished today
          <button className="linkbtn" onClick={() => setShowDate(true)}>
            Change
          </button>
        </div>
      ) : (
        <div className="datechips">
          <input type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Date finished" />
          <button className={`chip ${date === today() ? "on" : ""}`} onClick={() => setDate(today())}>
            Today
          </button>
          <button className={`chip ${!date ? "on" : ""}`} onClick={() => setDate("")}>
            No date
          </button>
        </div>
      )}
      <input
        className="input"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder={type === "tv" ? "Season or episode (optional)" : type === "podcast" ? "Episode (optional)" : "Detail (optional)"}
        aria-label="Detail"
      />
      <textarea ref={ref} className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
      {rated && !log && (
        <TierPicker
          label="Tier (optional)"
          tier={now === "nope" || now === "none" ? null : now}
          disliked={now === "nope"}
          onPick={(v) => setVerdict(v ?? "none")}
        />
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={save} disabled={busy} style={{ flex: 1 }}>
          {busy ? "Saving…" : log ? "Save" : "Log it"}
        </button>
        <button className="btn ghost" onClick={finish}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function readLogDraft(itemId: string): { detail?: string; note?: string } {
  try {
    const d = JSON.parse(draft.get(logDraft(itemId)) ?? "{}");
    return { detail: typeof d.detail === "string" ? d.detail : undefined, note: typeof d.note === "string" ? d.note : undefined };
  } catch {
    return {};
  }
}

/** One finish as History words it: the date (an undated one says so), its detail and Rewatch label, the note. */
export function LogText({ log, label }: { log: Log; label: string | null }) {
  const what = [log.detail, label].filter(Boolean).join(" · ");
  return (
    <>
      <div className="d">{fmtDay(log.finishedOn)}</div>
      <div style={{ minWidth: 0 }}>
        {what && <div className="mt" style={{ marginTop: 0 }}>{what}</div>}
        {log.note ? <div className="nt" style={{ marginTop: 2 }}>{log.note}</div> : !what && <div className="mt" style={{ marginTop: 0 }}>No note</div>}
      </div>
    </>
  );
}

export function LogRow({ log, label, onDirty }: { log: Log; label: string | null; onDirty?: DirtyFn }) {
  const { run, toast, idx } = useApp();
  const [edit, setEdit] = useState(false);
  const item = idx.items.get(log.itemId)!;
  if (edit) return <LogForm itemId={log.itemId} again type={item.type} log={log} done={() => setEdit(false)} onDirty={onDirty} />;
  async function del() {
    const r = await run(() => api(`/api/logs/${log.id}`, { method: "DELETE" }));
    if (r)
      toast("Entry deleted", {
        action: { label: "Undo", fn: () => run(() => api("/api/restore", { body: { kind: "log", id: log.id } }), "Restored") },
      });
  }
  return (
    <div className="logrow">
      <LogText log={log} label={label} />
      <div style={{ display: "flex", gap: 10 }}>
        <button className="linkbtn" onClick={() => setEdit(true)}>
          Edit
        </button>
        <button className="linkbtn" onClick={del}>
          Delete
        </button>
      </div>
    </div>
  );
}
