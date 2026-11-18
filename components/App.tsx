"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME, STREAM_TYPES, TEST_COPY_LINE, TYPE_NAV, typesInOrder, type MediaType, type View } from "@/lib/config";
import type { MoveTo } from "@/lib/order";
import type { Item, State } from "@/lib/types";
import { index, type Index } from "./client";
import { Icon, hueStyle } from "./bits";
import { NowView } from "./NowView";
import { Library } from "./Library";
import { SearchBox, SearchResults } from "./Search";
import { QueueView } from "./QueueView";
import { CapturesView } from "./CapturesView";
import { Settings } from "./Settings";
import { AddSheet, type AddOpts } from "./AddSheet";
import { ItemSheet } from "./ItemSheet";
import { Lockup } from "./Logo";
import { AddRail } from "./AddRail";
import { pushUrl, readUrl, type Filter, type WatchWith } from "./app/url";
import { useLibrary, type Run } from "./app/useLibrary";
import { ThemeIcon, useTheme, type Theme } from "./app/useTheme";
import { useToasts, type ToastFn } from "./app/useToasts";

export type { View };
const VIEW_NAME: Record<View, string> = { now: "Now", library: "Library", queue: "Up next", captures: "Shiny things", settings: "Settings" };
export type { Filter, WatchWith };

type Ctx = {
  state: State;
  idx: Index;
  filter: Filter;
  reload: () => Promise<void>;
  toast: ToastFn;
  /** Runs a write, reloads, and reports errors. Returns the result or undefined on failure. */
  run: Run;
  /** Opens an item. A list says which tiles it was opened among, so its Move up and down follow what's on screen. */
  openItem: (id: string, list?: string[]) => void;
  itemList: string[] | null;
  /** Moves a queued item in its section, on screen at once. */
  moveItem: (id: string, to: MoveTo) => void;
  openAdd: (opts?: AddOpts) => void;
  /** Starts an add on a given tab: in the right rail where there is one (desk), in the + sheet elsewhere. */
  startAdd: (opts: AddOpts) => void;
  go: (v: View) => void;
  /** Picks a type filter the way the nav does. */
  pickFilter: (f: Filter) => void;
  /** The chip's words and the tag on those shows; null when this copy has no such split. */
  watchLabel: string | null;
  /** The chip in effect: it only means something for what you watch, so books, podcasts and music ignore it. */
  watch: WatchWith;
  pickWatch: (w: WatchWith) => void;
  inWatch: (i: Item) => boolean;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** The five types in your order (Settings), for anything that lists them. */
  types: MediaType[];
  /** Shows a new order of types at once, then saves it; on failure says so and puts the saved order back. */
  saveTypeOrder: (order: MediaType[]) => void;
};
const AppCtx = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside App");
  return c;
}

export default function App({
  initial,
  initialView,
  initialFilter,
  initialItem,
  initialWatch = "all",
  watchLabel = null,
  testCopy = false,
}: {
  initial: State;
  initialView: View;
  initialFilter: Filter;
  initialItem: string | null;
  initialWatch?: WatchWith;
  watchLabel?: string | null;
  testCopy?: boolean;
}) {
  const { toasts, toast, dismiss } = useToasts();
  const { state, reload, run, moveItem, saveTypeOrder } = useLibrary(initial, toast);
  const { theme, setTheme, toggleTheme } = useTheme();
  const [view, setView] = useState<View>(initialView);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [watchPick, setWatchPick] = useState<WatchWith>(initialWatch);
  const [itemId, setItemId] = useState<string | null>(initialItem);
  const [itemList, setItemList] = useState<string[] | null>(null);
  const [add, setAdd] = useState<AddOpts | null>(null);
  const [q, setQ] = useState("");
  const itemStep = useRef(false);
  const chipsBar = useRef<HTMLDivElement>(null);
  const chipsSeen = useRef(false);
  const idx = useMemo(() => index(state), [state]);

  useEffect(() => {
    const onPop = () => {
      const u = readUrl();
      setView(u.view);
      setFilter(u.filter);
      setWatchPick(u.watch);
      setItemId(u.item);
      itemStep.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // An item opened here is one history step, so closing it steps back: the phone's
  // back button then leaves the page instead of landing on the same list again.
  // Opening one item from another swaps it in place, keeping that one step.
  const openItem = useCallback(
    (id: string, list?: string[]) => {
      const swap = readUrl().item !== null;
      setItemId(id);
      setItemList(list ?? null);
      pushUrl({ item: id }, swap);
      if (!swap) itemStep.current = true;
    },
    []
  );
  const closeItem = useCallback(() => {
    setItemId(null);
    if (itemStep.current) {
      itemStep.current = false;
      window.history.back();
    } else pushUrl({ item: null }, true);
  }, []);
  const go = useCallback(
    (v: View) => {
      setView(v);
      setQ("");
      pushUrl({ view: v, item: null });
      window.scrollTo({ top: 0 });
    },
    []
  );
  // A type filter always filters the page you're on (jumping to another page
  // felt unintuitive); Now points to where podcasts and music live instead.
  const pickFilter = (f: Filter) => {
    setFilter(f);
    pushUrl({ filter: f });
  };
  const pickWatch = (w: WatchWith) => {
    setWatchPick(w);
    pushUrl({ watch: w });
  };
  const watch: WatchWith = watchLabel && (filter === "all" || STREAM_TYPES.includes(filter)) ? watchPick : "all";
  const inWatch = (i: Item) => watch === "all" || i.tags.includes(watchLabel!) === (watch === "with");
  const openAdd = useCallback((opts?: AddOpts) => setAdd(opts ?? {}), []);
  const types = useMemo(() => typesInOrder(state.typeOrder), [state.typeOrder]);

  // The phone's type chips scroll sideways, and Books, Podcasts and Music start off the right edge:
  // bring the lit chip into view on first load and after a pick, so the bar always shows what's
  // picked. Only the bar moves, never the page. (The view is in the list because Settings drops the bar.)
  useEffect(() => {
    const bar = chipsBar.current;
    const chip = bar?.querySelector<HTMLElement>(".chip.on");
    const first = !chipsSeen.current;
    if (!bar || !chip || !bar.clientWidth) return;
    chipsSeen.current = true;
    const b = bar.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left >= b.left + 16 && c.right <= b.right - 16) return;
    const left = bar.scrollLeft + (c.left - b.left) - (b.width - c.width) / 2;
    const still = first || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bar.scrollTo({ left, behavior: still ? "auto" : "smooth" });
  }, [filter, view]);
  const [railAsk, setRailAsk] = useState<(AddOpts & { n: number }) | null>(null);
  const startAdd = useCallback((opts: AddOpts) => {
    if (window.matchMedia("(min-width: 1180px)").matches) setRailAsk((a) => ({ ...opts, n: (a?.n ?? 0) + 1 }));
    else setAdd(opts);
  }, []);
  // The + opens on the capture tab from Shiny things, like the desk rail does; elsewhere on the last tab used.
  const openPlus = () => openAdd(view === "captures" ? { mode: "capture", type: filter === "all" ? undefined : filter } : undefined);

  // "n" opens the add sheet from anywhere on a keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== "INPUT" && tag !== "TEXTAREA" && !add && !itemId) {
        e.preventDefault();
        setAdd({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [add, itemId]);

  const ctx: Ctx = { state, idx, filter, reload, toast, run, openItem, itemList, moveItem, openAdd, startAdd, go, pickFilter, watchLabel, watch, pickWatch, inWatch, theme, setTheme, types, saveTypeOrder };
  const count = (t: Filter) => (t === "all" ? state.items.length : state.items.filter((i) => i.type === t).length);
  const filters: Filter[] = ["all", ...types];
  const filterLabel = (f: Filter) => (f === "all" ? "Everything" : TYPE_NAV[f]);

  return (
    <AppCtx.Provider value={ctx}>
      {testCopy && (
        <div className="testcopy" role="note">
          {TEST_COPY_LINE}
        </div>
      )}
      <div className="shell" data-view={view}>
        <a className="skip" href="#main">
          Skip to the page
        </a>
        <nav className="nav" aria-label="Main">
          <button className="brand" onClick={() => go("now")} title="Go to Now" aria-label={`${APP_NAME}: go to Now`}>
            <Lockup layout="horizontal" />
          </button>
          <SearchBox q={q} setQ={setQ} />
          {filters.map((f) => (
            <button key={f} className={`it ${filter === f ? "on" : ""}`} onClick={() => pickFilter(f)} aria-pressed={filter === f}>
              <span className={`sw ${f === "all" ? "all" : ""}`} style={f === "all" ? undefined : { background: `var(--${f})` }} />
              {filterLabel(f)}
              <span className="n">{count(f)}</span>
            </button>
          ))}
          <div className="sep">Views</div>
          {(["now", "library", "queue", "captures"] as View[]).map((v) => (
            <button key={v} className={`it ${view === v ? "on" : ""}`} onClick={() => go(v)} aria-current={view === v ? "page" : undefined}>
              {VIEW_NAME[v]}
            </button>
          ))}
          <div className="foot">
            <button className="btn add" onClick={openPlus}>
              <Icon.plus /> Add something
            </button>
            <div style={{ display: "flex", gap: 4 }}>
              <button className={`it ${view === "settings" ? "on" : ""}`} onClick={() => go("settings")} style={{ flex: 1 }}>
                Settings
              </button>
              <button className="iconbtn" onClick={toggleTheme} aria-label="Switch light or dark" title="Switch light or dark">
                <ThemeIcon theme={theme} />
              </button>
            </div>
          </div>
        </nav>

        <div className="phone-top">
          <button className="brand" onClick={() => go("now")} title="Go to Now" aria-label={`${APP_NAME}: go to Now`}>
            <Lockup layout="horizontal" />
          </button>
          <SearchBox q={q} setQ={setQ} />
          <button className="iconbtn" onClick={toggleTheme} aria-label="Switch light or dark">
            <ThemeIcon theme={theme} />
          </button>
          <button className="iconbtn" onClick={() => go("settings")} aria-label="Settings">
            <Icon.gear />
          </button>
        </div>
        {view !== "settings" && (
          <div className="chips-bar" ref={chipsBar} role="toolbar" aria-label="Filter by type">
            {filters.map((f) => (
              <button
                key={f}
                className={`chip ${f !== "all" ? "type" : ""} ${filter === f ? "on" : ""}`}
                style={f !== "all" ? hueStyle(f) : undefined}
                onClick={() => pickFilter(f)}
                aria-pressed={filter === f}
              >
                {f !== "all" && <span className="sw" style={{ background: `var(--${f})` }} />}
                {filterLabel(f)}
              </button>
            ))}
          </div>
        )}

        <main className="main" id="main" tabIndex={-1}>
          {q.trim() ? (
            <SearchResults q={q} />
          ) : (
            <>
              {view === "now" && <NowView />}
              {view === "library" && <Library />}
              {view === "queue" && <QueueView />}
              {view === "captures" && <CapturesView />}
              {view === "settings" && <Settings />}
            </>
          )}
        </main>

        <AddRail view={view} ask={railAsk} />

        <nav className="tabbar" aria-label="Views">
          <TabBtn v="now" view={view} go={go} icon={<Icon.now />} />
          <TabBtn v="library" view={view} go={go} icon={<Icon.shelf />} />
          <button className="plus" onClick={openPlus} aria-label="Add something">
            <Icon.plus />
          </button>
          <TabBtn v="queue" view={view} go={go} icon={<Icon.queue />} />
          <TabBtn v="captures" view={view} go={go} icon={<Icon.quote />} />
        </nav>
      </div>

      {itemId && idx.items.get(itemId) && <ItemSheet key={itemId} id={itemId} onClose={closeItem} />}
      {add && <AddSheet opts={add} onClose={() => setAdd(null)} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.bad ? "bad" : ""}`} role={t.bad ? "alert" : "status"}>
            <span>{t.msg}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.fn();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}

function TabBtn({ v, view, go, icon }: { v: View; view: View; go: (v: View) => void; icon: React.ReactNode }) {
  return (
    <button className={view === v ? "on" : ""} onClick={() => go(v)} aria-current={view === v ? "page" : undefined}>
      {icon}
      {VIEW_NAME[v]}
    </button>
  );
}
