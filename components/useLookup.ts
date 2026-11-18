"use client";

import { useEffect, useState } from "react";
import type { MediaType } from "@/lib/config";
import type { LookupResult } from "@/lib/types";
import { api } from "./client";

export type LookupState = "idle" | "loading" | "done" | "error";

/**
 * Title search as you type: waits for a pause in the typing, asks /api/lookup, and keeps the first
 * eight results. Fewer than two characters, or `on: false` (something is already picked, or there is
 * nothing to look up), clears it. An answer to an earlier question is dropped.
 */
export function useLookup(type: MediaType, q: string, on = true) {
  const [results, setResults] = useState<LookupResult[]>([]);
  const [state, setState] = useState<LookupState>("idle");
  const [provider, setProvider] = useState<string | null>(null);
  useEffect(() => {
    if (!on || q.trim().length < 2) {
      setResults([]);
      setState("idle");
      return;
    }
    let live = true;
    setState("loading");
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: LookupResult[]; error?: string; provider: string }>(`/api/lookup?type=${type}&q=${encodeURIComponent(q.trim())}`);
        if (!live) return;
        setResults(r.results.slice(0, 8));
        setProvider(r.provider);
        setState(r.error ? "error" : "done");
      } catch {
        if (live) setState("error");
      }
    }, 380);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [type, q, on]);
  return { results, state, provider };
}
