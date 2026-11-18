"use client";

import { STREAM_TYPES } from "@/lib/config";
import { useApp, type WatchWith } from "./App";

/** Everything / Solo / With someone, on Now and Up next. One order underneath: this only narrows what shows. */
export function WatchChips() {
  const { watchLabel, watch, pickWatch, filter } = useApp();
  if (!watchLabel || (filter !== "all" && !STREAM_TYPES.includes(filter))) return null;
  const choices: [WatchWith, string][] = [
    ["all", "Everything"],
    ["solo", "Solo"],
    ["with", watchLabel],
  ];
  return (
    <div className="chips watchchips" role="toolbar" aria-label="Filter by who's watching">
      {choices.map(([w, name]) => (
        <button key={w} className={`chip ${watch === w ? "on" : ""}`} onClick={() => pickWatch(w)} aria-pressed={watch === w}>
          {name}
        </button>
      ))}
    </div>
  );
}
