"use client";

import { useCallback, useRef, useState } from "react";
import type { MediaType } from "@/lib/config";
import { placeFor, queueOrder, type MoveTo } from "@/lib/order";
import type { State } from "@/lib/types";
import { api } from "../client";
import type { ToastFn } from "./useToasts";

/** Runs a write, reloads, and reports errors. Returns the result or undefined on failure. */
export type Run = <T>(fn: () => Promise<T>, okMsg?: string | ((r: T) => string)) => Promise<T | undefined>;

/**
 * The library as the page holds it: what the server sent with the page, re-fetched after each write.
 * Two kinds of change show at once and save behind: a move in a queue section, and the order of types.
 */
export function useLibrary(initial: State, toast: ToastFn) {
  const [state, setState] = useState<State>(initial);

  // Runs after a write that already succeeded, so a failed refresh must not read as a failed save
  // (that invites a retry, which would log the same thing twice).
  const reload = useCallback(async () => {
    try {
      setState(await api<State>("/api/state"));
    } catch {
      toast("Saved, but the screen didn't refresh. Reload the page to see it.", { bad: true });
    }
  }, [toast]);

  const run = useCallback<Run>(
    async (fn, okMsg) => {
      try {
        const r = await fn();
        await reload();
        if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg);
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong", { bad: true });
        return undefined;
      }
    },
    [reload, toast]
  );

  // The new place shows at once. Moves go to the server one at a time, in order, and the list refreshes after the last.
  const moves = useRef(Promise.resolve());
  const movesLeft = useRef(0);
  const moveItem = useCallback(
    (id: string, to: MoveTo) => {
      setState((s) => {
        const me = s.items.find((i) => i.id === id);
        const place = me && placeFor(s.items.filter((i) => i.queue === me.queue && i.id !== id).sort(queueOrder), to);
        return place == null ? s : { ...s, items: s.items.map((i) => (i.id === id ? { ...i, sortPos: place } : i)) };
      });
      movesLeft.current++;
      moves.current = moves.current.then(async () => {
        try {
          await api(`/api/items/${id}/move`, { method: "POST", body: to });
        } catch (e) {
          toast(e instanceof Error ? e.message : "Something went wrong", { bad: true });
        }
        if (--movesLeft.current === 0) await reload();
      });
    },
    [reload, toast]
  );

  // Same pattern for the order of types: on screen at once, saved one at a time in order.
  const typeSaves = useRef(Promise.resolve());
  const saveTypeOrder = useCallback(
    (order: MediaType[]) => {
      setState((s) => ({ ...s, typeOrder: order }));
      typeSaves.current = typeSaves.current.then(async () => {
        try {
          await api("/api/settings", { method: "PUT", body: { typeOrder: order } });
        } catch (e) {
          toast(e instanceof Error ? e.message : "Could not save the order", { bad: true });
          await reload();
        }
      });
    },
    [reload, toast]
  );

  return { state, reload, run, moveItem, saveTypeOrder };
}
