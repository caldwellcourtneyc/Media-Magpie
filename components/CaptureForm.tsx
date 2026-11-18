"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CAPTURE_DETAIL, CAPTURE_KINDS, KIND_NAME, TIME_TYPES, TYPE_ONE, type CaptureKind, type MediaType } from "@/lib/config";
import { normalizeTime } from "@/lib/time";
import type { Capture, Item } from "@/lib/types";
import { useApp } from "./App";
import { Cover, hueStyle } from "./bits";
import { api, fmtDay, normalize, today } from "./client";
import { shrinkImage, type Shrunk } from "./shrink";

/** Below this width the form is the phone's quick one. */
const PHONE = "(max-width: 859px)";

/**
 * One capture, new or opened. Words are optional: with none it saves as a mark (somewhere and
 * when, or a screenshot), shows on Shiny things marked To finish. On the phone the form is
 * the quick one: kind, image, the words, then From, episode
 * and time, and the rarer fields fold under More. Save stays pinned to the bottom of the sheet or rail.
 */
export function CaptureForm({
  preItem,
  editing,
  defaultType,
  onDone,
  setDirty,
  focus = true,
  draft,
}: {
  preItem: Item | null;
  editing: Capture | null;
  defaultType: MediaType | null;
  onDone: () => void;
  setDirty: (d: boolean) => void;
  /** False on the desk rail until you pick the tab, so loading the page never grabs focus. */
  focus?: boolean;
  /** A storage key: the typed line survives a reload until it's saved (the rail has no close-to-confirm). */
  draft?: string;
}) {
  const { state, idx, run, toast, reload, types } = useApp();
  // Read once: the form is only drawn in the browser, after a tap.
  const [phone] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE).matches);
  // New captures start on Note.
  const [kind, setKind] = useState<CaptureKind>((editing?.kind as CaptureKind) ?? "note");
  const [body, setBodyState] = useState(editing?.body ?? "");
  useEffect(() => {
    if (!draft || editing) return;
    try {
      const d = localStorage.getItem(draft);
      if (d) setBodyState(d);
    } catch {
      /* storage unavailable */
    }
  }, [draft, editing]);
  const setBody = (v: string) => {
    setBodyState(v);
    if (!draft) return;
    try {
      if (v) localStorage.setItem(draft, v);
      else localStorage.removeItem(draft);
    } catch {
      /* drafts are a convenience */
    }
  };
  const [itemId, setItemId] = useState<string | null>(editing ? editing.itemId : preItem?.id ?? null);
  const [find, setFind] = useState("");
  const [who, setWho] = useState(editing?.who ?? "");
  const [source, setSource] = useState(editing?.source ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [mediaType, setMediaType] = useState<MediaType | null>(editing ? (editing.mediaType as MediaType | null) : defaultType);
  const [detail, setDetail] = useState(editing?.detail ?? "");
  const [time, setTime] = useState(editing?.time ?? "");
  const [timeBad, setTimeBad] = useState(false);
  const [talk, setTalk] = useState(editing?.talk ?? false);
  // undefined: the saved image stays as it is; null: take it off; a pick: the new one.
  const [image, setImage] = useState<Shrunk | null | undefined>(undefined);
  const [shrinking, setShrinking] = useState(false);
  const [zoom, setZoom] = useState(false);
  // Escape closes the full-screen screenshot, not the sheet under it.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setZoom(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoom]);
  // The standalone fields (where, who, type) wait behind one link under the From search. Anything
  // already in them keeps them open (see standaloneOpen), so folding can never hide or drop a value.
  const [standalone, setStandalone] = useState(false);
  const whereRef = useRef<HTMLInputElement>(null);
  const toWhere = useRef(false);
  useEffect(() => {
    if (!standalone || !toWhere.current) return;
    toWhere.current = false;
    whereRef.current?.focus();
  }, [standalone]);
  // The Paste image button needs the async clipboard; looked for after mount, like anything browser-only.
  const [canPaste, setCanPaste] = useState(false);
  const [pasteMiss, setPasteMiss] = useState(false);
  useEffect(() => setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.read === "function"), []);
  const saveBar = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(Boolean(editing && (editing.url || editing.note || editing.who)));
  const [dateMode, setDateMode] = useState<"today" | "none" | "keep">(editing ? "keep" : "today");
  const [busy, setBusy] = useState(false);

  // No quick-pick chips here: attaching is by search only, and nothing is prefilled.
  const attached = itemId ? idx.items.get(itemId) ?? null : null;
  const matches = useMemo(() => {
    const n = normalize(find);
    if (n.length < 2) return [];
    return state.items.filter((i) => normalize(i.title).includes(n)).slice(0, 6);
  }, [find, state.items]);

  const fromType = attached?.type ?? mediaType;
  const showTime = Boolean((fromType && TIME_TYPES.includes(fromType)) || time);
  const showDetail = Boolean(attached || mediaType || detail);
  const hasImage = image ? true : image === null ? false : Boolean(editing?.image);
  const savedSrc = editing?.image && image === undefined ? `/api/images/${editing.image.id}` : null;
  const imgSrc = image ? image.url : savedSrc;
  const words = body.trim();
  // Claude's words stay tagged until you rewrite them here; then they're yours.
  const byClaude = Boolean(editing?.byClaude && body === editing.body);
  // Anything to go on: words, or an image, or where it's from. With no words it's a mark.
  const goesOn = Boolean(words || hasImage || itemId || source.trim() || detail.trim() || time.trim() || url.trim());

  // New: anything typed or picked counts. Opened: any change from the saved capture counts.
  const changed = editing
    ? kind !== editing.kind ||
      body !== editing.body ||
      itemId !== editing.itemId ||
      who !== (editing.who ?? "") ||
      source !== (editing.source ?? "") ||
      url !== (editing.url ?? "") ||
      note !== (editing.note ?? "") ||
      mediaType !== editing.mediaType ||
      detail !== (editing.detail ?? "") ||
      time !== (editing.time ?? "") ||
      talk !== editing.talk ||
      image !== undefined ||
      dateMode !== "keep"
    : Boolean(words || image || detail.trim() || time.trim());
  useEffect(() => setDirty(changed), [changed, setDirty]);
  const canSave = goesOn && !busy && !shrinking && !timeBad;

  const standaloneHeld = Boolean(source.trim() || who.trim() || mediaType);
  const standaloneOpen = standalone || standaloneHeld;
  // Once open they stay open, so clearing a box to retype it doesn't fold the box away mid-edit.
  useEffect(() => {
    if (standaloneHeld) setStandalone(true);
  }, [standaloneHeld]);

  /** One image per capture, however it arrives (picked or pasted): shrunk here, replacing any other. */
  async function attach(file: File) {
    setPasteMiss(false);
    setShrinking(true);
    try {
      setImage(await shrinkImage(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't use that image", { bad: true });
    } finally {
      setShrinking(false);
    }
  }
  const attachRef = useRef(attach);
  attachRef.current = attach;

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void attach(file);
  }

  // A paste anywhere in the form's sheet or rail, when the clipboard holds an image, attaches it as if
  // picked. Text pasted into a box stays an ordinary paste, even when an image rides along with it.
  useEffect(() => {
    const bar = saveBar.current;
    const root = bar?.closest<HTMLElement>(".sheet, .addrail") ?? bar?.parentElement;
    if (!root) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      const t = e.target;
      const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== "file");
      if (typing && e.clipboardData?.getData("text/plain")) return;
      e.preventDefault();
      void attachRef.current(file);
    };
    root.addEventListener("paste", onPaste);
    return () => root.removeEventListener("paste", onPaste);
  }, []);

  /** The Paste image button: reads the clipboard directly (phones only fire a paste inside a text box). */
  async function pasteImage() {
    try {
      for (const entry of await navigator.clipboard.read()) {
        const type = entry.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        return void attach(new File([await entry.getType(type)], "pasted", { type }));
      }
    } catch {
      /* refused, or nothing readable: the same plain answer */
    }
    // Said in the form, by the button, not in a toast: a toast would sit on the pinned Save.
    setPasteMiss(true);
  }
  const pasteHint = pasteMiss ? (
    <p className="hint" role="status">
      No image on the clipboard
    </p>
  ) : null;

  function tidyTime() {
    const t = normalizeTime(time);
    if (t === null) setTimeBad(true);
    else setTime(t);
  }

  async function save() {
    if (!canSave) return;
    const t = normalizeTime(time);
    if (t === null) return setTimeBad(true);
    setBusy(true);
    const payload = {
      kind,
      body,
      itemId,
      who: who || null,
      source: itemId ? null : source || null,
      url: url || null,
      note: note || null,
      mediaType: itemId ? null : mediaType,
      detail: detail.trim() || null,
      time: t || null,
      talk,
      ...(editing?.byClaude && !byClaude ? { byClaude: false } : {}),
      ...(image ? { image: { type: image.type, data: image.data, width: image.width, height: image.height } } : image === null && editing?.image ? { image: null } : {}),
      ...(dateMode === "keep" ? {} : { capturedOn: dateMode === "today" ? today() : null }),
    };
    try {
      if (editing) {
        await api(`/api/captures/${editing.id}`, { method: "PATCH", body: payload });
        await reload();
        toast(!words ? "Saved, still marked To finish" : "Capture saved");
      } else {
        const r = await api<{ capture: Capture }>("/api/captures", { body: payload });
        setBody("");
        await reload();
        toast(!words ? "Saved, marked To finish" : attached ? `Captured, on ${attached.title}` : "Captured", {
          action: { label: "Undo", fn: () => run(() => api(`/api/captures/${r.capture.id}`, { method: "DELETE" }), "Undone") },
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

  async function remove() {
    if (!editing) return;
    setDirty(false);
    await run(() => api(`/api/captures/${editing.id}`, { method: "DELETE" }));
    toast("Capture deleted", {
      action: { label: "Undo", fn: () => run(() => api("/api/restore", { body: { kind: "capture", id: editing.id } }), "Restored") },
    });
    onDone();
  }

  // A new capture puts the cursor in the words, on the phone too (since the words moved up under the image).
  const focusAt: "words" | null = !focus || (phone && editing) ? null : "words";
  const auto = (at: typeof focusAt) => (focusAt === at ? { autoFocus: true, "data-autofocus": true } : {});

  const kinds = (
    <div className="chips" role="radiogroup" aria-label="Kind" key="kinds">
      {CAPTURE_KINDS.map((k) => (
        <button key={k} role="radio" aria-checked={kind === k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
          {KIND_NAME[k]}
        </button>
      ))}
    </div>
  );

  const wordsField = (
    <label className="field" key="words">
      <span>
        {kind === "quote" ? "The line" : kind === "link" ? "What it is" : kind === "idea" ? "The idea" : "Note"}
        {byClaude ? " · Written by Claude" : ""}
      </span>
      <textarea
        className="textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        {...auto("words")}
        placeholder={editing && !editing.body ? "Write it up" : phone ? "Or leave it and finish it later" : kind === "quote" ? "Type it while it is fresh" : ""}
        style={{ minHeight: phone ? 96 : 120 }}
      />
    </label>
  );

  // Finishing a mark means reading its screenshot, so there it leads, big, and opens full screen in place.
  const bigShot = Boolean(editing && !editing.body && imgSrc);
  const imageField = bigShot ? (
    <div className="field" key="image">
      <button className="capshot" onClick={() => setZoom(true)} aria-label="Open the screenshot full screen">
        <img src={imgSrc!} alt="This mark's screenshot" />
      </button>
      {/* Portaled: the sheet's slide-in transform would otherwise trap a fixed overlay inside it. */}
      {zoom &&
        createPortal(
          <button className="capzoom" onClick={() => setZoom(false)} aria-label="Close the screenshot">
            <img src={imgSrc!} alt="This mark's screenshot, full size" />
          </button>,
          document.body
        )}
      <div className="capimg">
        <label className={`linkbtn filepick ${shrinking ? "busy" : ""}`}>
          {shrinking ? "Shrinking it…" : "Change image"}
          <input type="file" accept="image/*" className="vh" onChange={pick} disabled={shrinking} />
        </label>
        {canPaste && (
          <button className="linkbtn" onClick={pasteImage} disabled={shrinking}>
            Paste image
          </button>
        )}
        <button className="linkbtn" onClick={() => setImage(null)}>
          Remove image
        </button>
      </div>
      {pasteHint}
    </div>
  ) : (
    <div className="field" key="image">
      {imgSrc && (
        <div className="capimg">
          {savedSrc ? (
            <a href={savedSrc} target="_blank" rel="noopener" title="Open the full image">
              <img src={imgSrc} alt="This capture's image" />
            </a>
          ) : (
            <img src={imgSrc} alt="The picked image" />
          )}
          <button className="linkbtn" onClick={() => setImage(null)}>
            Remove image
          </button>
        </div>
      )}
      <div className="capbtns">
        <label className={`btn ghost filepick ${shrinking ? "busy" : ""}`}>
          {shrinking ? "Shrinking it…" : imgSrc ? "Change image" : "Upload Image?"}
          <input type="file" accept="image/*" className="vh" onChange={pick} disabled={shrinking} />
        </label>
        {canPaste && (
          <button className="btn ghost" onClick={pasteImage} disabled={shrinking}>
            Paste image
          </button>
        )}
      </div>
      {pasteHint}
    </div>
  );

  const fromField = (
    <div className="field" key="from">
      <span>From</span>
      {attached ? (
        <div className="picked">
          <Cover item={attached} tiny />
          <div style={{ minWidth: 0 }}>
            <b>{attached.title}</b>
            <small>{[TYPE_ONE[attached.type], attached.creator].filter(Boolean).join(" · ")}</small>
          </div>
          <button className="linkbtn" onClick={() => setItemId(null)}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find something in your log" autoComplete="off" />
          {matches.length > 0 && (
            <div className="results">
              {matches.map((i) => (
                <button
                  key={i.id}
                  className="res"
                  onClick={() => {
                    setItemId(i.id);
                    setFind("");
                  }}
                >
                  <Cover item={i} tiny />
                  <span>
                    <b>{i.title}</b>
                    <small>{[TYPE_ONE[i.type], i.creator].filter(Boolean).join(" · ")}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {standaloneOpen ? (
            <>
              <p className="hint">Or keep it standalone, from anywhere:</p>
              <div className="row2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label className="field">
                  <span>Where</span>
                  <input className="input" ref={whereRef} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Show, book, site" />
                </label>
                <label className="field">
                  <span>Who said it</span>
                  <input className="input" value={who} onChange={(e) => setWho(e.target.value)} />
                </label>
              </div>
              <div className="chips" role="radiogroup" aria-label="Media type (optional)">
                {types.map((t) => (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={mediaType === t}
                    className={`chip type ${mediaType === t ? "on" : ""}`}
                    style={hueStyle(t)}
                    onClick={() => setMediaType(mediaType === t ? null : t)}
                  >
                    <span className="sw" style={{ background: `var(--${t})` }} />
                    {TYPE_ONE[t]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button
              className="linkbtn"
              style={{ justifySelf: "start" }}
              onClick={() => {
                toWhere.current = true;
                setStandalone(true);
              }}
            >
              Not in your log? Say where it&apos;s from
            </button>
          )}
        </>
      )}
    </div>
  );

  // Where in it: episode (or track, page) and, for things you listen to or watch, the time.
  const whereIn =
    showDetail || showTime ? (
      <div className="row2" style={{ gridTemplateColumns: showDetail && showTime ? "1fr 1fr" : "1fr" }} key="wherein">
        {showDetail && (
          <label className="field">
            <span>{fromType ? CAPTURE_DETAIL[fromType] : "Episode or page"} (optional)</span>
            <input
              className="input"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={fromType === "podcast" || fromType === "tv" ? "Which one" : ""}
              autoComplete="off"
            />
          </label>
        )}
        {showTime && (
          <label className="field">
            <span>Time (optional)</span>
            <input
              className="input"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setTimeBad(false);
              }}
              onBlur={tidyTime}
              inputMode="numeric"
              placeholder="13:09"
              autoComplete="off"
              aria-invalid={timeBad || undefined}
            />
            {timeBad && <p className="hint">Use a time like 13:09, or type 1309.</p>}
          </label>
        )}
      </div>
    ) : null;

  const whoField = attached ? (
    <label className="field" key="who">
      <span>Who said it (optional)</span>
      <input className="input" value={who} onChange={(e) => setWho(e.target.value)} />
    </label>
  ) : null;

  const linkField = (
    <label className="field" key="link">
      <span>Link (optional)</span>
      <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://" autoComplete="off" />
    </label>
  );
  // A Note or an Idea is its own words, so a second note box only shows when one is already saved.
  const noteShown = (kind !== "note" && kind !== "idea") || Boolean(note);
  const noteField = !noteShown ? null : (
    <label className="field" key="note">
      <span>Your note (optional)</span>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
    </label>
  );
  const dateField = (
    <div className="datechips" key="date">
      <span className="label">Date</span>
      {editing && (
        <button className={`chip ${dateMode === "keep" ? "on" : ""}`} onClick={() => setDateMode("keep")}>
          {editing.capturedOn ? `Keep ${fmtDay(editing.capturedOn)}` : "Keep undated"}
        </button>
      )}
      <button className={`chip ${dateMode === "today" ? "on" : ""}`} onClick={() => setDateMode("today")}>
        Today
      </button>
      <button className={`chip ${dateMode === "none" ? "on" : ""}`} onClick={() => setDateMode("none")}>
        No date
      </button>
    </div>
  );

  // Your switch; after a talk, Claude's line sits apart from your note.
  const talkField = (
    <div className="field" key="talk">
      {editing?.talkedOn && (
        <div className="talked">
          <b>Talked about {fmtDay(editing.talkedOn)}</b>
          {editing.talkNote && <p>{editing.talkNote}</p>}
        </div>
      )}
      <div className="chips">
        <button className={`chip ${talk ? "on" : ""}`} aria-pressed={talk} onClick={() => setTalk(!talk)}>
          Talk about it
        </button>
      </div>
    </div>
  );

  const moreBtn = (
    <button className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setMore(true)} key="more">
      {`More: ${[attached ? "who said it" : null, "link", noteShown ? "note" : null, "date"].filter(Boolean).join(", ")}`}
    </button>
  );

  // On the phone the image comes right after the kind, so a screenshot-only mark needs no scrolling,
  // and the words right after that.
  const fields = bigShot
    ? phone
      ? [imageField, kinds, wordsField, fromField, whereIn, talkField, ...(more ? [whoField, linkField, noteField, dateField] : [moreBtn])]
      : [imageField, kinds, wordsField, fromField, whereIn, whoField, linkField, noteField, dateField, talkField]
    : phone
      ? [kinds, imageField, wordsField, fromField, whereIn, talkField, ...(more ? [whoField, linkField, noteField, dateField] : [moreBtn])]
      : [kinds, wordsField, imageField, fromField, whereIn, whoField, linkField, noteField, dateField, talkField];

  return (
    <>
      {fields}
      {/* Pinned to the bottom of the sheet or rail while the form scrolls under it; at the end it sits after the last field. */}
      <div className="capsave" ref={saveBar}>
        <button className="btn wide" style={{ minHeight: 50, fontSize: "var(--fs-body)" }} disabled={!canSave} onClick={save}>
          {busy ? "Saving…" : editing ? "Save changes" : words ? "Save capture" : "Save to finish later"}
        </button>
      </div>
      {editing && (
        <button className="btn danger" onClick={remove}>
          Delete this capture
        </button>
      )}
    </>
  );
}
