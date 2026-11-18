"use client";

import { useEffect, useState } from "react";
import { CREATOR_ONE, TIER_NAME, TYPE_ONE, type Tier } from "@/lib/config";
import type { Item } from "@/lib/types";
import { hue } from "./client";

type CSS = React.CSSProperties & Record<`--${string}`, string>;

/** Cover links that didn't load on this page, so every tile showing one falls back at once. */
const brokenCovers = new Set<string>();

/**
 * Loads a cover link on its own and says whether it works (a 1px placeholder counts as broken).
 * Used to double-check a cover that may have failed before the page came alive, and by the Missing covers review.
 */
export function checkCover(url: string): Promise<boolean> {
  if (brokenCovers.has(url)) return Promise.resolve(false);
  return new Promise((done) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    const t = setTimeout(() => done(true), 15000); // slow is not broken
    img.onload = () => {
      clearTimeout(t);
      if (img.naturalWidth <= 1) brokenCovers.add(url);
      done(img.naturalWidth > 1);
    };
    img.onerror = () => {
      clearTimeout(t);
      brokenCovers.add(url);
      done(false);
    };
    img.src = url;
  });
}

export function Cover({ item, className = "", tiny = false }: { item: Pick<Item, "title" | "type" | "coverUrl" | "entity">; className?: string; tiny?: boolean }) {
  const style: CSS = { "--hue": hue(item.type) };
  const url = item.coverUrl;
  // A link that doesn't load shows the title block, not an empty frame. The server can't know, so this
  // starts false and flips in the browser.
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(url ? brokenCovers.has(url) : false), [url]);
  const fail = () => {
    if (url) brokenCovers.add(url);
    setBad(true);
  };
  if (url && !bad) {
    style["--img"] = `url("${url.replace(/"/g, "%22")}")`;
    return (
      <div className={`cv ${className}`} style={style}>
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={fail}
          onLoad={(e) => e.currentTarget.naturalWidth <= 1 && fail()}
          ref={(img) => {
            // An image that failed before the page came alive fired its error with nobody listening.
            if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) checkCover(url).then((ok) => !ok && setBad(true));
          }}
        />
      </div>
    );
  }
  const creator = item.entity === "creator";
  return (
    <div className={`cv ph ${creator ? "creator" : ""} ${tiny ? "tiny" : ""} ${className}`} style={style} aria-hidden>
      <b>{item.title}</b>
      <i>{creator ? CREATOR_ONE[item.type] : TYPE_ONE[item.type]}</i>
    </div>
  );
}

export function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) return null;
  return (
    <span className={`tier ${tier}`}>
      {tier === "top" ? "★ " : ""}
      {TIER_NAME[tier]}
    </span>
  );
}

export function TypeTag({ item }: { item: Pick<Item, "type" | "entity"> }) {
  return (
    <span className="tag" style={{ "--hue": hue(item.type) } as CSS}>
      {item.entity === "creator" ? CREATOR_ONE[item.type] : TYPE_ONE[item.type]}
    </span>
  );
}

export function hueStyle(t: Parameters<typeof hue>[0]): CSS {
  return { "--hue": hue(t) };
}

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const Icon = {
  plus: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  chevron: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  now: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8" />
    </svg>
  ),
  star: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z" />
    </svg>
  ),
  shelf: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 4v16M9.5 4v16M14 6.5l4 13M3 20h18" />
    </svg>
  ),
  queue: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 6h10M5 12h14M5 18h8" />
      <path d="M18 4l3 2-3 2z" />
    </svg>
  ),
  quote: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M7 17c-2 0-3-1.5-3-3.5C4 10 6 7.5 9 6.5M17 17c-2 0-3-1.5-3-3.5 0-3.5 2-6 5-7" />
    </svg>
  ),
  // A cog, not sliders: sliders beside the search box read as a filter.
  gear: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  sun: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" {...P}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  dots: () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  ),
};
