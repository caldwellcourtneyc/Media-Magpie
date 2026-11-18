"use client";

// The rows on an item's About tab: who with, order, coming soon, status, seasons, where to watch.
import { FOLLOW_NAME, NOT_ON_MINE, SERVICE_NAME, STREAM_TYPES, TV_STATUS_NAME, type FollowStatus as FollowStatusValue } from "@/lib/config";
import { queueOrder } from "@/lib/order";
import { latestSeasonOut, soonLine } from "@/lib/soon";
import type { Item } from "@/lib/types";
import { networkService } from "@/lib/where";
import { useApp } from "../App";
import { fmtDay, fmtWhen, today } from "../client";
import { useHideSoon, useSoon } from "../ComingSoon";
import { ServicePicker } from "../Pickers";

export type Patch = (body: Partial<Item>, msg?: string) => Promise<unknown>;

/** Solo or with someone: the same words as the chips on Now and Up next. The tag goes last, so a first tag stays the list it names. */
export function WatchWithField({ item, patch }: { item: Item; patch: Patch }) {
  const { watchLabel } = useApp();
  if (!watchLabel) return null;
  const on = item.tags.includes(watchLabel);
  return (
    <div className="field">
      <span>Who with</span>
      <div className="chips" role="radiogroup" aria-label="Who with">
        <button role="radio" aria-checked={!on} className={`chip ${!on ? "on" : ""}`} onClick={() => on && patch({ tags: item.tags.filter((t) => t !== watchLabel) }, "Solo")}>
          Solo
        </button>
        <button role="radio" aria-checked={on} className={`chip ${on ? "on" : ""}`} onClick={() => !on && patch({ tags: [...item.tags, watchLabel] }, watchLabel)}>
          {watchLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Move to top, up and down: the phone's way to reorder, and the way without a mouse anywhere. Up and down
 * step past whatever is beside it in the list it was opened from, so the move always shows there.
 */
export function OrderField({ item, label = "Order" }: { item: Item; label?: string }) {
  const { state, itemList, inWatch, moveItem } = useApp();
  if (!item.queue) return null;
  const section = state.items.filter((i) => i.queue === item.queue);
  const sameKind = (i: Item) => (STREAM_TYPES.includes(item.type) ? STREAM_TYPES.includes(i.type) && (i.id === item.id || inWatch(i)) : i.type === item.type);
  // Opened from somewhere else (the Library, a search, a link): among its own kind in that section, under the chip you have on.
  const peers = (itemList?.includes(item.id) ? section.filter((i) => itemList.includes(i.id)) : section.filter(sameKind)).sort(queueOrder);
  const at = peers.findIndex((i) => i.id === item.id);
  if (peers.length < 2) return null;
  return (
    <div className="field">
      <span>
        {label}<small className="orderat">{at + 1} of {peers.length}</small>
      </span>
      <div className="chips" role="group" aria-label="Move in the list">
        <button className="chip" disabled={at === 0} onClick={() => moveItem(item.id, { top: true })}>
          Move to top
        </button>
        <button className="chip" disabled={at === 0} onClick={() => moveItem(item.id, { above: peers[at - 1].id })}>
          Move up
        </button>
        <button className="chip" disabled={at === peers.length - 1} onClick={() => moveItem(item.id, { below: peers[at + 1].id })}>
          Move down
        </button>
      </div>
    </div>
  );
}

/** A show with a dated next season or episode says so, with a way to hide it from Coming Soon. Nothing when undated. */
export function SoonField({ item }: { item: Item }) {
  const e = useSoon(true).find((x) => x.item.id === item.id);
  const { hide, show } = useHideSoon();
  if (!e) return null;
  const hidden = item.soonHidden === e.key;
  return (
    <div className="field">
      <span>Coming soon</span>
      <div className="soon-field">
        <b>{soonLine(e, fmtWhen)}</b>
        {e.kind === "airing" && e.finale && e.finale !== e.date && <small>Finale {fmtDay(e.finale)}</small>}
        {hidden ? <small>{e.kind === "release" ? "Hidden from Coming Soon." : "Hidden from Coming Soon until the next season."}</small> : null}
      </div>
      <div>
        {hidden ? (
          <button className="btn small ghost" onClick={() => show(item)}>
            Show again
          </button>
        ) : (
          <button className="btn small ghost" onClick={() => hide(e)}>
            Hide from Coming Soon
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Podcasts, artists, authors: Following, Paused or Dropped, and for podcasts Ended (they stopped
 * making it, as opposed to you dropping it). None is lit while it sits in the queue to try.
 */
export function FollowStatus({ item, patch }: { item: Item; patch: Patch }) {
  const toTry = item.queue === "up_next" || item.queue === "saved";
  const options: FollowStatusValue[] = item.type === "podcast" ? ["following", "paused", "dropped", "ended"] : ["following", "paused", "dropped"];
  const current =
    item.status === "paused" || item.status === "dropped" || item.status === "ended" ? item.status : item.status === "following" || !toTry ? "following" : null;
  return (
    <div className="field">
      <span>Status</span>
      <div className={`seg ${options.length === 4 ? "seg4" : ""}`} role="radiogroup" aria-label="Status">
        {options.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={current === s}
            className={current === s ? "on" : ""}
            // Following something you'd queued to try takes it out of the queue.
            onClick={() => current !== s && patch({ status: s, ...(s === "following" && toTry ? { queue: null } : {}) }, FOLLOW_NAME[s])}
          >
            {FOLLOW_NAME[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Where you are in a show: Watching, Caught up or Done, and the seasons seen under it, which are the
 * one record of how far (you mark a season when you finish it). Having seen every season out, it
 * offers the next state; it never switches by itself.
 */
export function TvStatus({ item, patch }: { item: Item; patch: Patch }) {
  const watching = item.queue === "in_progress";
  const current = watching ? "watching" : item.status === "following" ? "following" : item.status === "done" ? "done" : null;
  const set = (k: "watching" | "following" | "done") =>
    patch(
      k === "watching" ? { queue: "in_progress", status: null } : { status: k, ...(watching ? { queue: null } : {}) },
      TV_STATUS_NAME[k]
    );
  const latest = latestSeasonOut(item, today());
  const seenAll = latest != null && (item.seasonsSeen ?? 0) >= latest;
  const next = seenAll ? (item.airInfo?.status === "Ended" ? "done" : "following") : null;
  return (
    <div className="field">
      <span>Where you are</span>
      <div className="seg" role="radiogroup" aria-label="Where you are">
        {(["watching", "following", "done"] as const).map((k) => (
          <button key={k} role="radio" aria-checked={current === k} className={current === k ? "on" : ""} onClick={() => current !== k && set(k)}>
            {TV_STATUS_NAME[k]}
          </button>
        ))}
      </div>
      <Seasons item={item} patch={patch} last={item.airInfo?.status === "Ended" ? latest : null} />
      {next && current !== next && (
        <button className="btn ghost" onClick={() => set(next)}>
          {next === "done" ? "That was the last season: mark Done" : "Seen every season out: mark Caught up"}
        </button>
      )}
      {current === "following" && !seenAll && item.queue !== "up_next" && (
        <button className="btn ghost" onClick={() => patch({ queue: "up_next" }, "New season is in Up Next")}>
          New season is out: add to Up Next
        </button>
      )}
    </div>
  );
}

/**
 * Seasons seen as chips: tap the last lit one to take it back, + for the next.
 * `last` is an ended show's final season; no + past it. A running show always gets one,
 * since a new season can be out before the TVmaze cache knows.
 */
function Seasons({ item, patch, last }: { item: Item; patch: Patch; last: number | null }) {
  const n = item.seasonsSeen ?? 0;
  const set = (k: number) => patch({ seasonsSeen: k || null }, k ? `Seen through season ${k}` : "Seasons cleared");
  return (
    <>
      <div className="hint">Seasons seen</div>
      <div className="chips" role="group" aria-label="Seasons seen">
        {Array.from({ length: n }, (_, k) => k + 1).map((s) => (
          <button key={s} className="chip on" aria-label={`Season ${s}${s === n ? ", tap to take back" : ""}`} onClick={() => set(s === n ? n - 1 : s)}>
            S{s}
          </button>
        ))}
        {(last == null || n < last) && (
          <button className="chip dash" onClick={() => set(n + 1)}>
            + S{n + 1}
          </button>
        )}
      </div>
    </>
  );
}

export const whereMsg = (v: string[], auto: string | null = null) =>
  v.includes(NOT_ON_MINE)
    ? "Kept on your radar: not on your services"
    : v.length
      ? "Saved where to watch"
      : auto
        ? `Back to TVmaze's: ${SERVICE_NAME[auto] ?? auto}`
        : "Cleared where to watch";

/** TV: where to watch, with the TVmaze network shown as the default until you set your own. */
export function TvWhere({ item, patch }: { item: Item; patch: Patch }) {
  const auto = networkService(item.creator);
  return <ServicePicker value={item.watchOn} auto={auto} onChange={(v) => patch({ watchOn: v }, whereMsg(v, auto))} />;
}
