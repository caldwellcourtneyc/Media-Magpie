"use client";

import { useId } from "react";
import { MARK_BODY, MARK_VIEWBOX_NEST, MARK_VIEWBOX_TIGHT } from "./logoMark";

/** The Media Magpie mark: the nest and bird in the current ink, the cards in the media hues. */
export function LogoMark({ centerOnNest = false, className }: { centerOnNest?: boolean; className?: string }) {
  // Each instance gets its own mask id: the nav and the phone bar both render a mark, and one of
  // them is always hidden, which would break a shared id.
  const id = "mm" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      className={className}
      viewBox={centerOnNest ? MARK_VIEWBOX_NEST : MARK_VIEWBOX_TIGHT}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: MARK_BODY.replaceAll("__ID__", id) }}
    />
  );
}

/**
 * The lockup. Horizontal: mark beside the two-line wordmark (nav, phone bar).
 * Stacked: mark centered on its nest above the wordmark (login). The wordmark is Jost:
 * thin "Media" over heavy "Magpie" (DESIGN.md, Brand).
 */
export function Lockup({ layout }: { layout: "horizontal" | "stacked" }) {
  return (
    <span className={`lockup ${layout}`}>
      <LogoMark className="lockup-mark" centerOnNest={layout === "stacked"} />
      <span className="lockup-words">
        <span className="w1">Media</span>
        <span className="w2">Magpie</span>
      </span>
    </span>
  );
}
