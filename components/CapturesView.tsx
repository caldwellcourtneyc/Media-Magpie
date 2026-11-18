"use client";

import { useState } from "react";
import { CAPTURE_KINDS, KIND_NAME, TYPE_NAV, type CaptureKind } from "@/lib/config";
import type { Capture } from "@/lib/types";
import { useApp } from "./App";
import { attribution, captureType, fmtDay, hue, isMark, markLine } from "./client";

/**
 * The kind chips, then three states: To finish (marks, saved with
 * no words yet), To talk about (switched on, not talked about yet), Talked about.
 */
type Show = CaptureKind | "all" | "finish" | "talk" | "talked";
const STATE_NAME = { finish: "To finish", talk: "To talk about", talked: "Talked about" } as const;
const EMPTY: Record<"finish" | "talk" | "talked", string> = {
  finish: "Nothing to finish. A capture saved with no words yet (a screenshot, or just where it's from) waits here.",
  talk: "Nothing waiting for a talk. Switch on Talk about it on a capture and it waits here.",
  talked: "Nothing talked about yet. Once we've talked a capture through, it moves here, out of the main list.",
};

/** Talked through and not switched back on: kept out of the main list, under Talked about. */
const talkedAway = (c: Capture) => Boolean(c.talkedOn) && !c.talk;

export function CapturesView() {
  const { state, idx, filter, openItem, openAdd } = useApp();
  const [show, setShow] = useState<Show>("all");
  const ofType = state.captures.filter((c) => filter === "all" || captureType(c, idx) === filter);
  const list = ofType.filter((c) =>
    show === "finish" ? isMark(c) : show === "talk" ? c.talk : show === "talked" ? talkedAway(c) : !talkedAway(c) && (show === "all" || c.kind === show)
  );
  return (
    <>
      <div className="viewhead">
        <h1>Shiny things</h1>
        <span className="sub">{filter === "all" ? list.length : `${list.length} from ${TYPE_NAV[filter].toLowerCase()}`}</span>
        {/* Not drawn on desk, where the rail beside it is the open capture form (see .cap-add). */}
        <button className="btn small cap-add" style={{ marginLeft: "auto" }} onClick={() => openAdd({ mode: "capture", type: filter === "all" ? undefined : filter })}>
          + Capture
        </button>
      </div>
      <div className="chips" style={{ marginBottom: 18 }} role="toolbar" aria-label="Filter by kind">
        {(["all", ...CAPTURE_KINDS, "finish", "talk", "talked"] as const).map((k) => (
          <button key={k} className={`chip ${show === k ? "on" : ""}`} onClick={() => setShow(k)} aria-pressed={show === k}>
            {k === "all" ? "All kinds" : k === "finish" || k === "talk" || k === "talked" ? STATE_NAME[k] : KIND_NAME[k]}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="capgrid">
          {list.map((c) => {
            const t = captureType(c, idx);
            const who = attribution(c, idx);
            const mark = isMark(c);
            // The whole card opens; a button laid over it does that, so the link can sit on top as a real link.
            return (
              <div key={c.id} className={`cap ${c.kind} ${mark ? "mark" : ""}`} style={{ "--hue": hue(t) } as React.CSSProperties}>
                <button
                  className="cap-open"
                  aria-label={mark ? `Finish this: ${who || "Where from?"}` : `Open: ${c.body.slice(0, 60)}`}
                  // A mark opens to be finished; a finished capture on something opens that thing.
                  onClick={() => (!mark && c.itemId && idx.items.get(c.itemId) ? openItem(c.itemId) : openAdd({ mode: "capture", captureId: c.id }))}
                />
                <span className="kind">
                  {[
                    KIND_NAME[c.kind as CaptureKind] ?? c.kind,
                    mark ? "To finish" : null,
                    c.byClaude ? "Written by Claude" : null,
                    talkedAway(c) ? `Talked about ${fmtDay(c.talkedOn)}` : c.capturedOn ? fmtDay(c.capturedOn) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {mark ? (
                  <span className="markbody">
                    {c.image && <img src={`/api/images/${c.image.id}`} alt="" loading="lazy" />}
                    <span>
                      <b>{who || "Where from?"}</b>
                      <small>{markLine(c)}</small>
                    </span>
                  </span>
                ) : (
                  <>
                    {c.image && <img className="capthumb" src={`/api/images/${c.image.id}`} alt="" loading="lazy" />}
                    <p>{c.kind === "quote" ? `“${c.body}”` : c.body}</p>
                    {who && <small>{who}</small>}
                  </>
                )}
                {c.url && !mark && <CapLink url={c.url} />}
                {c.note && <div className="cnote">{c.note}</div>}
                {show === "talked" && c.talkNote && <div className="cnote">Where we landed: {c.talkNote}</div>}
              </div>
            );
          })}
        </div>
      ) : show === "finish" || show === "talk" || show === "talked" ? (
        <p className="empty">{EMPTY[show]}</p>
      ) : (
        <p className="empty">
          No captures here yet. Heard a line worth keeping? Tap + and pick Shiny things: it can hang off something you are listening to, or stand alone with a
          source.
        </p>
      )}
    </>
  );
}

/** A saved link, opened in a new tab. Only http and https links are ever stored (forms and import both check). */
export function CapLink({ url }: { url: string }) {
  if (!/^https?:\/\//i.test(url)) return null;
  return (
    <a className="caplink" href={url} target="_blank" rel="noopener noreferrer">
      {url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
    </a>
  );
}
