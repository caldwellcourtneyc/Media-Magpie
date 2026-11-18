"use client";

// Every item of the picked type. Podcasts and music live here: you follow them rather than
// logging each listen. Everything opens as five rooms, one per type; a type opens as its own room,
// by tier. Your own lists, books by author, and A to Z are rows. Not a Fan sits last and can be hidden.

import { useState } from "react";
import { CREATOR_ONE, TYPE_NAV, isFollowed } from "@/lib/config";
import type { Item } from "@/lib/types";
import { useApp, type Filter } from "./App";
import { Rooms, TypeRoom, listOf } from "./TierShelves";
import { Fold } from "./Fold";
import { ItemRow } from "./Search";
import { normalize, statusLabel } from "./client";

type Group = "rooms" | "tier" | "lists" | "author" | "az";
const NAME: Record<Group, string> = { rooms: "By type", tier: "Tier", lists: "Your lists", author: "By author", az: "A to Z" };
const NO_LIST = "Not on a list";
const NO_AUTHOR = "Author not set";

/** Rooms on Everything, tier on a type. Books also group by author. */
function groupsFor(filter: Filter): Group[] {
  if (filter === "all") return ["rooms", "lists", "az"];
  return filter === "book" ? ["tier", "lists", "author", "az"] : ["tier", "lists", "az"];
}

const sortTitle = (t: string) => t.replace(/^(the|a|an)\s+/i, "");
// Authors sort by surname: "Neil Gaiman" files under G.
const surname = (n: string) => n.trim().split(/\s+/).pop() ?? n;

function key(i: Item, g: Group): string {
  if (g === "az") {
    const c = sortTitle(i.title).charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : "#";
  }
  if (g === "author") return i.entity === "creator" ? i.title : i.creator?.trim() || NO_AUTHOR;
  return listOf(i) || NO_LIST;
}

export function Library() {
  const { state, idx, filter } = useApp();
  const [picked, setPicked] = useState<Partial<Record<Filter, Group>>>({});
  const items = state.items.filter((i) => filter === "all" || i.type === filter);
  const options = groupsFor(filter);
  const chosen = picked[filter];
  const g: Group = chosen && options.includes(chosen) ? chosen : options[0];
  const what = filter === "all" ? "items" : `in your library`;
  // Artists and authors are followed in their own right; only other name-only entries still want a pick.
  const needPick = items.filter((i) => i.entity === "creator" && !isFollowed(i)).length;

  const groups = (() => {
    if (g === "rooms" || g === "tier") return [];
    const m = new Map<string, Item[]>();
    // Not a Fan items leave their list or letter and sit together at the bottom.
    for (const i of items) if (!i.disliked) m.set(key(i, g), [...(m.get(key(i, g)) ?? []), i]);
    return [...m.entries()]
      .map(([k, v]) => [k, v.sort((a, b) => sortTitle(a.title).localeCompare(sortTitle(b.title)))] as const)
      .sort(([a, av], [b, bv]) =>
        g === "az"
          ? Number(a === "#") - Number(b === "#") || a.localeCompare(b)
          : g === "author"
            ? Number(a === NO_AUTHOR) - Number(b === NO_AUTHOR) || surname(a).localeCompare(surname(b)) || a.localeCompare(b)
            : Number(a === NO_LIST) - Number(b === NO_LIST) || bv.length - av.length
      );
  })();
  const slug = (k: string) => "grp-" + (normalize(k).replace(/ /g, "-") || "other");
  const nope = items.filter((i) => i.disliked).sort((a, b) => sortTitle(a.title).localeCompare(sortTitle(b.title)));
  const rowMeta = (i: Item) => {
    const caps = idx.capsByItem.get(i.id)?.length ?? 0;
    // Following is the norm for podcasts and music, so only the exceptions are named.
    const standing = statusLabel(i);
    return (
      [
        // Under an author's heading the row needn't repeat the author.
        g === "author" ? null : i.entity === "creator" ? (isFollowed(i) ? CREATOR_ONE[i.type] : `${CREATOR_ONE[i.type]}, needs a pick`) : i.creator,
        standing && standing !== "Following" ? standing : null,
        caps ? `${caps} capture${caps > 1 ? "s" : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null
    );
  };

  return (
    <>
      <div className={`viewhead ${filter !== "all" ? "roomtop" : ""}`}>
        <h1>
          {filter !== "all" && <span className="sw big" style={{ background: `var(--${filter})` }} />}
          {filter === "all" ? "Library" : TYPE_NAV[filter]}
        </h1>
        <span className="sub">
          {items.length} {what}
          {needPick > 0 && ` · ${needPick} still need a pick`}
        </span>
        <div className={`seg lib-seg n${options.length}`} role="group" aria-label="Group by">
          {options.map((k) => (
            <button key={k} className={g === k ? "on" : ""} onClick={() => setPicked((p) => ({ ...p, [filter]: k }))} aria-pressed={g === k}>
              {NAME[k]}
            </button>
          ))}
        </div>
      </div>

      {g === "rooms" ? (
        <Rooms items={items} />
      ) : g === "tier" && filter !== "all" ? (
        <TypeRoom items={items} type={filter} />
      ) : (
        <>
          {groups.length > 1 && g !== "author" && (
            <nav className={`lib-jump ${g}`} aria-label="Jump to">
              {groups.map(([k, v]) => (
                <button key={k} className="chip" onClick={() => document.getElementById(slug(k))?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  {k}
                  {g === "lists" && <span className="n">{v.length}</span>}
                </button>
              ))}
            </nav>
          )}
          {groups.map(([k, v]) => (
            <section key={k} id={slug(k)} className="lib-group">
              <div className="tierhead">
                <h2>{k}</h2>
                <span>{v.length}</span>
              </div>
              <div className="roster">
                {v.map((i) => (
                  <ItemRow key={i.id} item={i} meta={rowMeta(i)} />
                ))}
              </div>
            </section>
          ))}
          {nope.length > 0 && (
            <Fold id="library-nope" title="Not a Fan" count={nope.length}>
              <div className="roster">
                {nope.map((i) => (
                  <ItemRow key={i.id} item={i} meta={rowMeta(i)} />
                ))}
              </div>
            </Fold>
          )}
          {!items.length && <p className="empty">Nothing here yet. Add something with +.</p>}
        </>
      )}
    </>
  );
}
