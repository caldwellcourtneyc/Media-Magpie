"use client";

import { useEffect, useRef, useState } from "react";
import { EXPORT_FORMAT, LIBBY_MAX, QUEUE_NAME, TYPE_NAV, TYPE_ONE, type LibbyLibrary, type MediaType } from "@/lib/config";
import type { Capture, Item, Log } from "@/lib/types";
import { useApp } from "./App";
import { CoverSettings } from "./CoverReview";
import { api, fmtDay, isMark, markLine, normalize } from "./client";

type Health = { database: string; rows: { items: number; logs: number; captures: number }; backups: string; seed: string | null };
type Trash = { items: Item[]; logs: (Log & { itemTitle: string; itemType: MediaType })[]; captures: Capture[] };
type Pending = { name: string; data: unknown; counts: { items: number; logs: number; captures: number } };

export function Settings() {
  const { state, run, toast, theme, setTheme, reload } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [trash, setTrash] = useState<Trash | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    api<Health>("/api/health").then(setHealth).catch(() => setHealth(null));
    api<Trash>("/api/trash").then(setTrash).catch(() => setTrash(null));
  };
  useEffect(refresh, [state]);

  async function pickFile(f: File | undefined) {
    setImportErr(null);
    setImportResult(null);
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.format !== EXPORT_FORMAT) throw new Error("This is not an export from this app.");
      setPending({
        name: f.name,
        data,
        counts: { items: data.items?.length ?? 0, logs: data.logs?.length ?? 0, captures: data.captures?.length ?? 0 },
      });
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Could not read that file.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function doImport() {
    if (!pending) return;
    try {
      const r = await api<{ before: Health["rows"]; after: Health["rows"]; kept: { items: number; logs: number; captures: number } }>(
        "/api/import",
        { body: pending.data }
      );
      await reload();
      const kept = r.kept.items + r.kept.logs + r.kept.captures;
      setImportResult(
        `Imported ${pending.name}. Before: ${r.before.items} items, ${r.before.logs} finishes, ${r.before.captures} captures. ` +
          `After: ${r.after.items} items, ${r.after.logs} finishes, ${r.after.captures} captures.` +
          (kept ? ` ${kept} ${kept === 1 ? "entry was" : "entries were"} newer here than in the file, so the newer version was kept.` : "")
      );
      setPending(null);
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Import failed. Nothing was changed.");
    }
  }

  const restore = (kind: "item" | "log" | "capture", id: string) =>
    run(() => api("/api/restore", { body: { kind, id } }), "Restored").then(refresh);

  async function signOut() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  const hosted = Boolean(health?.backups.startsWith("off"));
  const trashCount = trash ? trash.items.length + trash.logs.length + trash.captures.length : 0;

  return (
    <>
      <div className="viewhead">
        <h1>Settings</h1>
      </div>

      {/* Three groups, loud: what's yours, this device, and what it's wired to. Two columns on desk (see .setgroups). */}
      <div className="setgroups">
        <div className="setgroup">
          <h2>Library</h2>
          <section className="setsec">
            <h3>Your data</h3>
            <p>
              {health
                ? `${health.rows.items} items, ${health.rows.logs} finishes, ${health.rows.captures} captures, counting deleted ones you can still restore.`
                : "Checking the database…"}
            </p>
            <p>Export saves everything to one file, deleted entries included.</p>
            <div className="chips">
              <a className="btn" href="/api/export" download>
                Export everything
              </a>
              <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                Import a file
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="sr" onChange={(e) => pickFile(e.target.files?.[0])} aria-label="Import file" />
            </div>
            {pending && (
              <div className="subform">
                <div>
                  <b>{pending.name}</b> holds {pending.counts.items} items, {pending.counts.logs} finishes and {pending.counts.captures} captures.
                </div>
                <p className="hint">
                  Importing merges by entry: anything in the file that isn&apos;t here is added. If an entry is in both, whichever was changed
                  more recently wins, so an older file never undoes newer changes. Nothing here is deleted.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={doImport}>
                    Import it
                  </button>
                  <button className="btn ghost" onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {importErr && <div className="err">{importErr}</div>}
            {importResult && <div className="err">{importResult}</div>}
            {/* One line here; where the files go and how long they're kept is under For developers. */}
            {health && (
              <p className="hint">
                {hosted ? "Backups are files pulled to a computer by a scheduled task. Export now and then too." : "Backed up automatically, one file a day."}
              </p>
            )}
          </section>

          <TypeOrderSettings />

          <CoverSettings />

          <section className="setsec">
            <h3>Recently deleted {trashCount > 0 && <span className="hint">({trashCount})</span>}</h3>
            {!trash ? (
              <p>Loading…</p>
            ) : trashCount === 0 ? (
              <p>Nothing deleted. Anything you delete waits here until you restore it.</p>
            ) : (
              <div>
                {trash.items.map((i) => {
                  // Restoring next to a live copy of the same thing would give you two.
                  const twin = state.items.find((x) => x.type === i.type && normalize(x.title) === normalize(i.title));
                  return (
                    <div key={i.id} className="trash-row">
                      <div>
                        {i.title}
                        <small>
                          {TYPE_ONE[i.type]}, with its finishes and captures · deleted {fmtDay(i.deletedAt!.slice(0, 10))}
                        </small>
                        {twin && <small className="twin">You already have it{twin.queue ? ` in ${QUEUE_NAME[twin.queue]}` : ""}, so restoring makes two.</small>}
                      </div>
                      <button className="btn small ghost" onClick={() => restore("item", i.id)}>
                        {twin ? "Restore anyway" : "Restore"}
                      </button>
                    </div>
                  );
                })}
                {trash.logs.map((l) => (
                  <div key={l.id} className="trash-row">
                    <div>
                      A finish of {l.itemTitle}
                      <small>
                        {fmtDay(l.finishedOn)}
                        {l.note ? ` · ${l.note.slice(0, 60)}` : ""}
                      </small>
                    </div>
                    <button className="btn small ghost" onClick={() => restore("log", l.id)}>
                      Restore
                    </button>
                  </div>
                ))}
                {trash.captures.map((c) => (
                  <div key={c.id} className="trash-row">
                    <div>
                      {isMark(c) ? `A mark: ${markLine(c)}` : c.body.slice(0, 80)}
                      {c.body.length > 80 ? "…" : ""}
                      <small>Capture · deleted {fmtDay(c.deletedAt!.slice(0, 10))}</small>
                    </div>
                    <button className="btn small ghost" onClick={() => restore("capture", c.id)}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="setside">
          <div className="setgroup">
            <h2>This device</h2>
            <section className="setsec">
              <h3>Light or dark</h3>
              <div className="chips" role="radiogroup" aria-label="Theme">
                {([null, "light", "dark"] as const).map((t) => (
                  <button key={String(t)} role="radio" aria-checked={theme === t} className={`chip ${theme === t ? "on" : ""}`} onClick={() => setTheme(t)}>
                    {t === null ? "Match this device" : t === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </section>

            <section className="setsec">
              <h3>Sign out</h3>
              <div>
                <button
                  className="btn ghost"
                  onClick={() => {
                    signOut().catch(() => toast("Could not sign out", { bad: true }));
                  }}
                >
                  Sign out
                </button>
              </div>
            </section>
          </div>

          <div className="setgroup">
            <h2>Connections</h2>
            <LibbySettings />

            {/* Folded: env names and endpoints read like errors to fix if they sit open. */}
            <details className="setsec devfold">
              <summary>
                <h3>For developers</h3>
              </summary>
              {health && <p>Stored in the {health.database} database.</p>}
              {health && (
                <p>
                  {hosted
                    ? "Backups: on a hosted database they are export files pulled to a computer by a scheduled backup task (see the README)."
                    : `Backups: every change also writes a full export to ${health.backups}, one file per day: the last 14 days, then one a week for 8 weeks. Images are saved once, in its images folder; keep that folder with the files.`}
                </p>
              )}
              <p>The export is one JSON file. Keep a copy somewhere safe now and then; it is also how you move to another copy of this app.</p>
              <p>
                A small JSON API takes the same actions as this page, for scripts and voice assistants. Set <span className="codeline">API_TOKEN</span> on the
                server and send it as <span className="codeline">Authorization: Bearer …</span>. The README lists the calls; the one-step ones are{" "}
                <span className="codeline">POST /api/logs</span> and <span className="codeline">POST /api/captures</span>.
              </p>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}

/** Libby libraries: each book's sheet links to a search for it at each one. Every change saves at once. */
function LibbySettings() {
  const { state, run } = useApp();
  const list = state.libby;
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const save = (next: LibbyLibrary[], msg: string) => run(() => api("/api/settings", { method: "PUT", body: { libby: next } }), msg);
  async function add() {
    if (!name.trim() || !key.trim()) return;
    if (await save([...list, { name, key }], `Added ${name.trim()}`)) {
      setName("");
      setKey("");
    }
  }
  return (
    <section className="setsec">
      <h3>Libby</h3>
      <p>{list.length > 0 ? "Book pages link to these libraries." : "Add your library and each book page links to it in Libby."}</p>
      {list.length > 0 && (
        <div className="libbylist">
          {list.map((l) => (
            <div key={l.key} className="trash-row">
              <div>
                {l.name}
                <small>{l.key}</small>
              </div>
              <button className="btn small ghost" onClick={() => save(list.filter((x) => x.key !== l.key), `Removed ${l.name}`)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {list.length < LIBBY_MAX && (
        <form
          className="libbyadd"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, like New York" aria-label="Library name" autoComplete="off" />
          <input
            className="input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Libby code, like nypl"
            aria-label="Libby code"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <button className="btn" type="submit" disabled={!name.trim() || !key.trim()}>
            Add library
          </button>
          <p className="hint">The code is the word after /library/ in the address, once you pick the library at libbyapp.com.</p>
        </form>
      )}
    </section>
  );
}

/**
 * The order the five types are listed in, everywhere they are listed, on every device (kept on the
 * server). Up and down like the queue's Order row: touch works, no dragging. A move shows at once.
 */
function TypeOrderSettings() {
  const { types, saveTypeOrder } = useApp();
  const move = (at: number, by: -1 | 1) => {
    const next = [...types];
    [next[at], next[at + by]] = [next[at + by], next[at]];
    saveTypeOrder(next);
  };
  return (
    <section className="setsec">
      <h3>Order of types</h3>
      <p>Sets the order in the nav, the phone&apos;s chips, the Library and the Add form, on every device.</p>
      <ol className="typeorder" aria-label="Order of types">
        {types.map((t, at) => (
          <li key={t}>
            <span className="sw" style={{ background: `var(--${t})` }} />
            <b>{TYPE_NAV[t]}</b>
            <div className="chips" role="group" aria-label={`Move ${TYPE_NAV[t]}`}>
              <button className="chip" disabled={at === 0} onClick={() => move(at, -1)}>
                Move up
              </button>
              <button className="chip" disabled={at === types.length - 1} onClick={() => move(at, 1)}>
                Move down
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
