"use client";

import { NOT_ON_MINE, SERVICE_NAME, STREAM_TYPES, TYPE_NAV } from "@/lib/config";
import { queueOrder } from "@/lib/order";
import type { Item } from "@/lib/types";
import { whereToWatch } from "@/lib/where";
import { useApp } from "./App";
import { Cover } from "./bits";
import { fmtWhen, whereYouAre } from "./client";
import { SoonStrip, useSoon } from "./ComingSoon";
import { useDragOrder } from "./useDragOrder";
import { WatchChips } from "./WatchChips";
import { Welcome } from "./Welcome";
import { soonLine } from "@/lib/soon";

/**
 * Home: deciding what to watch. What you're watching, what you're reading, what lands soon, and
 * what's ready to start. Adding and capturing live in the right rail on desk (the + on the
 * phone); captures live in Shiny things. Podcasts and music live in the Library.
 */
export function NowView() {
  const { state, filter, watch, inWatch, openItem, go } = useApp();
  const watchable = (i: Item) => STREAM_TYPES.includes(i.type) && (filter === "all" || filter === i.type) && inWatch(i);
  const watching = state.items.filter((i) => i.queue === "in_progress" && watchable(i)).sort(queueOrder);
  const queued = state.items.filter((i) => i.queue === "up_next" && watchable(i)).sort(queueOrder);
  const fresh = queued.filter((i) => !i.watchOn.includes(NOT_ON_MINE));
  const radar = queued.length - fresh.length;
  const dragWatching = useDragOrder(watching);
  const dragFresh = useDragOrder(fresh);
  // Books in progress, in your own order. Under Everything the who's-watching chips treat a book as
  // untagged (Solo keeps it, the label leaves it out); with Books picked the chips don't apply.
  const reading = state.items.filter((i) => i.type === "book" && i.queue === "in_progress" && inWatch(i)).sort(queueOrder);
  const dragReading = useDragOrder(reading);
  const waiting = state.items.filter((i) => i.type === "book" && (i.queue === "up_next" || i.queue === "saved")).length;
  // A show you're watching says on its cover when the next episode or season lands.
  const soon = useSoon();
  const airNote = new Map(soon.map((e) => [e.item.id, soonLine(e, fmtWhen)]));

  const ids = (list: Item[]) => list.map((i) => i.id);
  const readingRow = reading.length > 0 && (
    <section className="now-reading">
      <h2 className="h2">
        Reading<small>{reading.length}</small>
      </h2>
      <div className="posters">
        {reading.map((i) => (
          <Poster key={i.id} item={i} onOpen={() => openItem(i.id, ids(reading))} drag={dragReading(i)} />
        ))}
      </div>
      {filter === "book" && waiting > 0 && (
        <button className="linkbtn" onClick={() => go("queue")}>
          {waiting === 1 ? "1 more book is waiting in Up next" : `${waiting} more books are waiting in Up next`}
        </button>
      )}
    </section>
  );

  // Nothing in the library yet: a welcome and first steps, whatever type is picked.
  if (!state.items.length) return <Welcome />;

  // Books on Now: what you're reading, alone, with a way to the rest. With nothing on the go, one line says where reading lives.
  if (filter === "book") {
    if (readingRow) return <div className="now">{readingRow}</div>;
    return (
      <div className="now-elsewhere">
        <p className="empty">No book on the go. Your reading lives in Up next.</p>
        <button className="btn" onClick={() => go("queue")}>
          Open Up next
        </button>
      </div>
    );
  }
  // Podcasts and music are followed, not finished, so they aren't on Now: one line says where they live, one tap away.
  if (filter !== "all" && !STREAM_TYPES.includes(filter)) {
    return (
      <div className="now-elsewhere">
        <p className="empty">{TYPE_NAV[filter]} live in the Library.</p>
        <button className="btn" onClick={() => go("library")}>
          Open the Library
        </button>
      </div>
    );
  }

  return (
    <>
      <WatchChips />
      <div className="now">
        <section className="now-watching">
          <h2 className="h2">
            Watching<small>{watching.length}</small>
          </h2>
          {watching.length ? (
            <div className="posters">
              {watching.map((i) => (
                <Poster key={i.id} item={i} onOpen={() => openItem(i.id, ids(watching))} air={airNote.get(i.id)} drag={dragWatching(i)} />
              ))}
            </div>
          ) : (
            <p className="empty">
              {watch !== "all" ? "Nothing here." : `Nothing on the go. Start something below, or ${filter === "movie" ? "put a movie In Progress" : "mark a show Watching"} from its page.`}
            </p>
          )}
        </section>

        {filter === "all" && readingRow}

        {/* Short and dated: under Watching, above the long list of things to start (three lines across on desk). */}
        <SoonStrip />

        <section className="now-new">
          <h2 className="h2">
            Up Next<small>{fresh.length}</small>
          </h2>
          {fresh.length ? (
            <div className="posters small">
              {fresh.map((i) => (
                <Poster key={i.id} item={i} onOpen={() => openItem(i.id, ids(fresh))} drag={dragFresh(i)} />
              ))}
            </div>
          ) : (
            <p className="empty">{watch !== "all" ? "Nothing here." : "Shows and movies you put in Up Next land here, ready to start."}</p>
          )}
          {radar > 0 && (
            <button className="linkbtn" onClick={() => go("queue")}>
              {radar} more {radar === 1 ? "is" : "are"} waiting until {radar === 1 ? "it's" : "they're"} on a service you have
            </button>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * A cover to tap. Under it: what lands next and where you are, once you've said (no prompt when you
 * haven't; seasons seen for shows), or where a queued one streams.
 */
function Poster({ item, onOpen, air, drag }: { item: Item; onOpen: () => void; air?: string; drag: object }) {
  const sub = item.queue === "in_progress" ? whereYouAre(item) : whereToWatch(item).keys.map((k) => SERVICE_NAME[k] ?? k).join(", ");
  return (
    <button className="poster" onClick={onOpen} {...drag}>
      <Cover item={item} />
      <b>{item.title}</b>
      {air && <small className="air">{air}</small>}
      {sub && <small>{sub}</small>}
    </button>
  );
}
