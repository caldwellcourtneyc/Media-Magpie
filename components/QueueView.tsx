"use client";

import { Fragment, useState } from "react";
import { NOT_ON_MINE, QUEUES, QUEUE_NAME, SERVICES, SERVICE_NAME, STREAM_QUEUES, STREAM_TYPES, type Queue } from "@/lib/config";
import { queueOrder } from "@/lib/order";
import type { Item } from "@/lib/types";
import { whereToWatch } from "@/lib/where";
import { useApp, type Filter } from "./App";
import { Cover } from "./bits";
import { whereYouAre } from "./client";
import { ComingSoonSection } from "./ComingSoon";
import { Fold } from "./Fold";
import { useDragOrder } from "./useDragOrder";
import { WatchChips } from "./WatchChips";

/** In Progress is named for what you do with the type picked; with Everything it holds books too, so it's In Progress. */
function inProgressName(filter: Filter): string {
  if (filter === "book") return "Reading";
  if (filter === "music" || filter === "podcast") return "Listening";
  if (filter === "all") return QUEUE_NAME.in_progress;
  return "Watching";
}

/**
 * Watching, then Coming soon, Up Next, Saved for Later, and No Access last (hideable): cover tiles,
 * newest first unless you moved them. A tile opens the item, where finishing and moving live.
 */
export function QueueView() {
  const { state, filter, inWatch } = useApp();
  const [service, setService] = useState<string | null>(null);
  const inType = (i: Item) => (filter === "all" || i.type === filter) && inWatch(i);
  // Only services that something queued is actually on get a filter chip. A show with nothing set
  // counts under its TVmaze network when that's one of yours.
  const on = (i: Item, k: string) => whereToWatch(i).keys.includes(k);
  const used = SERVICES.filter(([k]) => state.items.some((i) => i.queue && inType(i) && on(i, k)));
  const svc = used.some(([k]) => k === service) ? service : null;
  const sections = svc ? STREAM_QUEUES : QUEUES;
  const away = (i: Item) => i.watchOn.includes(NOT_ON_MINE);
  const queued = state.items.filter((i) => i.queue && inType(i) && (!svc || on(i, svc)));
  // No Access has its own section, unless you filtered to it.
  const noAccess = svc ? [] : queued.filter(away).sort(queueOrder);
  const name = (q: Queue) => (q === "in_progress" ? inProgressName(filter) : QUEUE_NAME[q]);
  return (
    <>
      <div className="viewhead">
        <h1>Up next</h1>
        <span className="sub">{state.items.filter((i) => i.queue && inType(i)).length} queued</span>
      </div>
      <WatchChips />
      {used.length > 0 && (
        <div className="chips" style={{ marginBottom: 6 }} role="toolbar" aria-label="Filter by streaming service">
          <button className={`chip ${!svc ? "on" : ""}`} onClick={() => setService(null)} aria-pressed={!svc}>
            Any service
          </button>
          {used.map(([k, n]) => (
            <button key={k} className={`chip ${svc === k ? "on" : ""}`} onClick={() => setService(svc === k ? null : k)} aria-pressed={svc === k}>
              {n}
            </button>
          ))}
        </div>
      )}
      {/* A service filter leaves Watching out, so Coming soon leads then. */}
      {svc && <ComingSoonSection service={svc} />}
      {sections.map((q) => {
        const list = queued.filter((i) => i.queue === q && (svc === NOT_ON_MINE || !away(i))).sort(queueOrder);
        // Filtered to a service, an empty section says nothing worth a heading.
        if (svc && !list.length) return null;
        return (
          <Fragment key={q}>
            <section>
              <h2 className="h2">
                {name(q)}
                <small>{list.length}</small>
              </h2>
              {list.length ? <Tiles items={list} /> : <p className="empty">Nothing here.</p>}
            </section>
            {q === "in_progress" && <ComingSoonSection service={svc} />}
          </Fragment>
        );
      })}
      {noAccess.length > 0 && (
        <Fold id="queue-no-access" title="No Access" count={noAccess.length}>
          <Tiles items={noAccess} showSection />
        </Fold>
      )}
    </>
  );
}

/** Cover tiles. Under each: where you are (in progress, once you've said; seasons seen for shows), or where it streams. */
function Tiles({ items, showSection = false }: { items: Item[]; showSection?: boolean }) {
  const { openItem, filter } = useApp();
  // No Access holds several sections at once, so there's no one order to drag within.
  const drag = useDragOrder(showSection ? [] : items);
  const ids = items.map((i) => i.id);
  return (
    <div className="qtiles">
      {items.map((i) => {
        const sub =
          i.queue === "in_progress"
            ? whereYouAre(i)
            : STREAM_TYPES.includes(i.type) && !showSection
              ? whereToWatch(i).keys.map((k) => SERVICE_NAME[k] ?? k).join(", ") || null
              : null;
        const where = showSection && i.queue ? (i.queue === "in_progress" ? inProgressName(filter) : QUEUE_NAME[i.queue]) : null;
        return (
          <button key={i.id} className="poster" onClick={() => openItem(i.id, ids)} {...drag(i)}>
            <Cover item={i} />
            <b>{i.title}</b>
            {(sub || where) && <small>{sub || where}</small>}
          </button>
        );
      })}
    </div>
  );
}
