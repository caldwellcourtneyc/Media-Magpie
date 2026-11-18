"use client";

import { useEffect, useState } from "react";

/**
 * A section you can hide: Not a Fan at the bottom of the Library, No Access at the bottom of
 * Up next. Hidden or shown is remembered on this device only (a convenience, not your data).
 */
export function Fold({ id, title, count, children }: { id: string; title: string; count: number; children: React.ReactNode }) {
  const storeKey = `ml-fold-${id}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storeKey) === "hidden");
    } catch {
      /* storage unavailable: shown */
    }
  }, [storeKey]);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      if (next) localStorage.setItem(storeKey, "hidden");
      else localStorage.removeItem(storeKey);
    } catch {
      /* remembering is a convenience */
    }
  };
  return (
    <section className={`fold ${hidden ? "is-hidden" : ""}`}>
      <div className="foldhead">
        <h2 className="h2">
          {title}
          <small>{count}</small>
        </h2>
        <button className="linkbtn" onClick={toggle} aria-expanded={!hidden}>
          {/* Fold, not Hide: on Up next, Hide means taking a season out of Coming soon. */}
          {hidden ? "Show" : "Fold"}
        </button>
      </div>
      {!hidden && children}
    </section>
  );
}
