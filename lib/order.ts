import type { Item } from "./types";

/**
 * A queue section's one order, shared by every filter: newest on top unless you moved it. Each item's
 * place is a number on one scale, its queued time in milliseconds, or sortPos once you move it. A move
 * writes one row, with a number between its new neighbours, and a newly queued item (queued now) still
 * lands on top.
 */
type Orderable = Pick<Item, "id" | "sortPos" | "queuedAt">;

export type MoveTo = { top: true } | { above: string } | { below: string };

export const orderKey = (i: Orderable) => i.sortPos ?? (i.queuedAt ? Date.parse(i.queuedAt) : 0);
export const queueOrder = (a: Orderable, b: Orderable) => orderKey(b) - orderKey(a) || a.id.localeCompare(b.id);

/**
 * The number for a move, given the rest of the section in order. Null when there's no number left
 * between the neighbours (only after many moves into one gap, or two items queued in the same instant).
 */
export function placeFor(others: Orderable[], to: MoveTo): number | null {
  if ("top" in to) return others.length ? orderKey(others[0]) + 1 : null;
  const target = "above" in to ? to.above : to.below;
  const at = others.findIndex((o) => o.id === target);
  if (at < 0) return null;
  const key = orderKey(others[at]);
  const next = others[at + ("above" in to ? -1 : 1)];
  if (!next) return key + ("above" in to ? 1 : -1);
  const mid = (key + orderKey(next)) / 2;
  return mid === key || mid === orderKey(next) ? null : mid;
}

/** The section's ids once the move is done, for spacing the whole section out when placeFor has no number. */
export function orderAfter(others: Orderable[], id: string, to: MoveTo): string[] {
  const ids = others.map((o) => o.id);
  const target = "top" in to ? null : "above" in to ? to.above : to.below;
  const at = target === null ? 0 : ids.indexOf(target) + ("below" in to ? 1 : 0);
  ids.splice(at, 0, id);
  return ids;
}

export const moveTarget = (to: MoveTo) => ("top" in to ? null : "above" in to ? to.above : to.below);
