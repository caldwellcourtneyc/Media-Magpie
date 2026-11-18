"use client";

import { useEffect, useState } from "react";
import { MEDIA_TYPES, typesInOrder, type MediaType, type Queue } from "@/lib/config";
import { useApp, type View } from "./App";
import { ItemForm, MODES, MODE_NAME, MODE_TYPES, type AddMode, type AddOpts } from "./AddSheet";
import { CaptureForm } from "./CaptureForm";
import { Icon } from "./bits";

// Drafts typed here survive a reload. The key predates the rail (it was Now's panel), so an
// unsaved line from before the move still comes back.
const DRAFT = "ml-now-draft";
const FOLD = "ml-rail-folded";

/**
 * The right rail on desk: the + sheet laid open on every page, the same tabs and forms. It folds
 * to a slim strip and remembers that per device. It starts on the page's type (a Books filter opens
 * on Book) and, on Shiny things, on the capture tab. Nothing takes focus until you pick a tab, so
 * loading a page never grabs the keyboard. Below 1180px there's no rail; the nav's button and the
 * phone's + open the sheet instead.
 */
export function AddRail({ view, ask }: { view: View; ask: (AddOpts & { n: number }) | null }) {
  const { filter, types } = useApp();
  const [folded, setFolded] = useState(false);
  const [mode, setMode] = useState<AddMode>("queue");
  const [picked, setPicked] = useState(false);
  const [type, setType] = useState<MediaType>(filter !== "all" ? filter : "tv");
  // Bumped after each save, so the form starts fresh for the next one.
  const [round, setRound] = useState(0);
  // The queue section an ask preselects (the empty library's "Add a show" starts on In Progress).
  const [startQueue, setStartQueue] = useState<Queue | undefined>(undefined);

  useEffect(() => {
    try {
      setFolded(localStorage.getItem(FOLD) === "1");
      if (localStorage.getItem(DRAFT)) setMode("capture");
    } catch {
      /* storage unavailable: open, on Queue */
    }
  }, []);
  // Follow the page: its type filter, and Shiny things means a capture.
  useEffect(() => {
    if (filter !== "all") setType(filter);
  }, [filter]);
  useEffect(() => {
    if (view === "captures") setMode("capture");
  }, [view]);

  // Asked for from the page (the empty library's first steps): open on that tab, ready to type.
  useEffect(() => {
    if (!ask) return;
    setFolded(false);
    try {
      localStorage.removeItem(FOLD);
    } catch {
      /* per-device convenience only */
    }
    setMode(ask.mode ?? "queue");
    if (ask.type) setType(ask.type);
    setStartQueue(ask.queue);
    setPicked(true);
    setRound((r) => r + 1);
  }, [ask]);

  const fold = (f: boolean) => {
    setFolded(f);
    try {
      if (f) localStorage.setItem(FOLD, "1");
      else localStorage.removeItem(FOLD);
    } catch {
      /* per-device convenience only */
    }
  };

  if (folded)
    return (
      <aside className="rail addrail folded" aria-label="Add something">
        <button className="railopen" onClick={() => fold(false)} aria-label="Open Add something" title="Open Add something">
          <Icon.plus />
          <span>Add something</span>
        </button>
      </aside>
    );

  const allowed = typesInOrder(types, mode === "capture" ? MEDIA_TYPES : MODE_TYPES[mode]);
  const shown = allowed.includes(type) ? type : allowed[0];
  const done = () => {
    setStartQueue(undefined);
    setRound((r) => r + 1);
  };

  return (
    <aside className="rail addrail" aria-label="Add something">
      <div className="railhead">
        <h2 className="h3">Add something</h2>
        <button className="iconbtn" onClick={() => fold(true)} aria-label="Fold Add something away" title="Fold away">
          <Icon.chevron />
        </button>
      </div>
      <div className="seg seg4 addtabs" role="tablist" aria-label="What are you adding">
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "on" : ""}
            onClick={() => {
              setMode(m);
              setStartQueue(undefined);
              setPicked(true);
            }}
          >
            {MODE_NAME[m]}
          </button>
        ))}
      </div>
      <div className="addpanel-body">
        {mode === "capture" ? (
          <CaptureForm
            key={"capture" + round}
            preItem={null}
            editing={null}
            defaultType={null}
            onDone={done}
            setDirty={() => {}}
            focus={picked}
            draft={DRAFT}
          />
        ) : (
          <ItemForm
            key={mode + round}
            mode={mode}
            types={allowed}
            type={shown}
            setType={setType}
            preItem={null}
            onDone={done}
            setDirty={() => {}}
            focus={picked}
            startQueue={startQueue}
          />
        )}
      </div>
    </aside>
  );
}
