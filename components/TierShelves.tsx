"use client";

import { CREATOR_ONE, STREAM_TYPES, TYPE_NAV, isFollowed, type MediaType } from "@/lib/config";
import type { Item } from "@/lib/types";
import { useApp } from "./App";
import { Cover } from "./bits";
import { Fold } from "./Fold";

const RANK = { top: 0, fave: 1, love: 2 } as const;
const sortTitle = (t: string) => t.replace(/^(the|a|an)\s+/i, "");
const byTitle = (a: Item, b: Item) => sortTitle(a.title).localeCompare(sortTitle(b.title));
/** No tier sorts after Love: nothing defaults to Love. */
const rank = (i: Item) => (i.tier ? RANK[i.tier] : 3);
const square = (t: MediaType) => t === "podcast" || t === "music";
/** Imported list headings sometimes carry a double space where a colon was. */
export const listOf = (i: Item) => i.tags[0]?.replace(/\s{2,}/g, ": ") || null;
const NO_LIST = "Not on a list";
const NOUN: Record<MediaType, string> = { tv: "show", movie: "movie", music: "artist or album", podcast: "podcast", book: "book" };

/**
 * Everything, as five rooms: one shelf per type, Top Shelf and Faves first and marked on the cover,
 * every item there (the shelf scrolls). Not a Fan sits last, across all types, and can be hidden.
 */
export function Rooms({ items }: { items: Item[] }) {
  const { pickFilter, types } = useApp();
  const nope = items.filter((i) => i.disliked).sort(byTitle);
  return (
    <>
      {types.map((t) => {
        const list = items.filter((i) => i.type === t && !i.disliked).sort((a, b) => rank(a) - rank(b) || byTitle(a, b));
        if (!list.length) return null;
        const up = list.filter((i) => i.tier === "top" || i.tier === "fave").length;
        return (
          <section key={t} className="room">
            <div className="roomhead">
              <span className="sw" style={{ background: `var(--${t})` }} />
              <h2>{TYPE_NAV[t]}</h2>
              <span className="n">
                {list.length}
                {up > 0 && ` · ${up} Top Shelf or Fave`}
              </span>
              <button
                className="linkbtn"
                onClick={() => {
                  // A room opens at its top, not wherever the Library was scrolled to.
                  pickFilter(t);
                  window.scrollTo({ top: 0 });
                }}
              >
                Open {TYPE_NAV[t]}
              </button>
            </div>
            <div className={`roomshelf ${square(t) ? "sq" : ""}`}>
              {list.map((i) => (
                <Tile key={i.id} item={i} mark />
              ))}
            </div>
          </section>
        );
      })}
      <NotAFan items={nope} />
    </>
  );
}

/** Music splits into albums (first, there are few) and artists; podcasts and books by your own lists, biggest first. TV and movies stay one grid. */
function groupsOf(list: Item[], type: MediaType): [string | null, Item[]][] {
  let groups: [string | null, Item[]][];
  if (type === "music") {
    groups = [
      ["Albums and soundtracks", list.filter((i) => i.entity !== "creator")],
      ["Artists", list.filter((i) => i.entity === "creator")],
    ];
  } else if (!STREAM_TYPES.includes(type) && list.some(listOf)) {
    const m = new Map<string, Item[]>();
    for (const i of list) m.set(listOf(i) ?? NO_LIST, [...(m.get(listOf(i) ?? NO_LIST) ?? []), i]);
    groups = [...m.entries()].sort(([a, av], [b, bv]) => Number(a === NO_LIST) - Number(b === NO_LIST) || bv.length - av.length);
  } else groups = [[null, list]];
  return groups.filter(([, l]) => l.length);
}

/**
 * One type's room, by tier. Top Shelf and Faves appear once they hold something. Loves, then No tier
 * yet, each split by your own lists where you have them (music: albums, then artists).
 */
export function TypeRoom({ items, type }: { items: Item[]; type: MediaType }) {
  const top = items.filter((i) => !i.disliked && i.tier === "top").sort(byTitle);
  const fave = items.filter((i) => !i.disliked && i.tier === "fave").sort(byTitle);
  const love = items.filter((i) => !i.disliked && i.tier === "love").sort(byTitle);
  const none = items.filter((i) => !i.disliked && !i.tier).sort(byTitle);
  const nope = items.filter((i) => i.disliked).sort(byTitle);
  const groups = groupsOf(love, type);

  return (
    <>
      {top.length > 0 && (
        <section>
          <div className="tierhead top">
            <h2>
              <span className="star">★ </span>Top Shelf
            </h2>
            <span>{top.length}</span>
          </div>
          <Grid items={top} size="top" />
        </section>
      )}
      {fave.length > 0 && (
        <section>
          <div className="tierhead">
            <h2>Faves</h2>
            <span>{fave.length}</span>
          </div>
          <Grid items={fave} size="fave" />
        </section>
      )}
      {(love.length > 0 || (!top.length && !fave.length && !none.length)) && (
        <section>
          <div className="tierhead">
            <h2>Loves</h2>
            <span>{love.length}</span>
          </div>
          {!top.length && !fave.length && <p className="hint roomhint">No Top Shelf or Faves yet. Open any {NOUN[type]} and set its tier; it moves up here.</p>}
          <Groups groups={groups} />
          {!items.length && <p className="empty">Nothing here yet. Add something with +.</p>}
        </section>
      )}
      {none.length > 0 && (
        <section>
          <div className="tierhead">
            <h2>No tier yet</h2>
            <span>{none.length}</span>
          </div>
          <Groups groups={groupsOf(none, type)} />
        </section>
      )}
      <NotAFan items={nope} />
    </>
  );
}

function Groups({ groups }: { groups: [string | null, Item[]][] }) {
  return groups.map(([name, l]) => (
    <div key={name ?? "all"}>
      {name && (
        <h3 className="subh">
          {name}
          <span>{l.length}</span>
        </h3>
      )}
      <Grid items={l} size="love" />
    </div>
  ));
}

function NotAFan({ items }: { items: Item[] }) {
  if (!items.length) return null;
  return (
    <Fold id="library-nope" title="Not a Fan" count={items.length}>
      <Grid items={items} size="love" />
    </Fold>
  );
}

function Grid({ items, size }: { items: Item[]; size: "top" | "fave" | "love" }) {
  const sq = items.length > 0 && items.every((i) => square(i.type));
  return (
    <div className={`rgrid ${size} ${sq ? "sq" : ""}`}>
      {items.map((i) => (
        <Tile key={i.id} item={i} />
      ))}
    </div>
  );
}

/** A cover and its title; under it the network, author or artist. In a room's shelf, Top Shelf and Faves are marked. */
function Tile({ item: i, mark = false }: { item: Item; mark?: boolean }) {
  const { openItem } = useApp();
  return (
    <button className="tile" onClick={() => openItem(i.id)}>
      <Cover item={i} />
      {mark && i.tier === "top" && <span className="tmark top">★ Top Shelf</span>}
      {mark && i.tier === "fave" && <span className="tmark fave">Fave</span>}
      <div className="ti">{i.title}</div>
      {i.entity === "creator" ? (
        <div className="pickline">{isFollowed(i) ? CREATOR_ONE[i.type] : `${CREATOR_ONE[i.type]}, needs a pick`}</div>
      ) : (
        i.creator && i.type !== "podcast" && <div className="by">{i.creator}</div>
      )}
    </button>
  );
}
