"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./bits";

const stack: symbol[] = [];

/**
 * Modal panel. Centered on desktop (or docked right with side), a bottom sheet
 * on phones, where it can be dragged down to close. If `dirty`, closing asks first with buttons that say what they do
 * (not the browser's OK/Cancel, where OK read as "keep it"), so a half-typed capture
 * is never thrown away by a stray tap. `top` replaces the title row with a header of
 * its own (the item sheet's cover and tabs); the close button stays in the corner.
 */
export function Sheet({
  title,
  onClose,
  children,
  foot,
  side = false,
  dirty = false,
  onDiscard,
  label,
  top,
  className = "",
}: {
  title: React.ReactNode;
  onClose: () => void;
  /** Runs on "Throw it away", before onClose: where a form clears its saved draft. */
  onDiscard?: () => void;
  children: React.ReactNode;
  foot?: React.ReactNode;
  side?: boolean;
  dirty?: boolean;
  label?: string;
  top?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [asking, setAsking] = useState(false);
  const askingRef = useRef(asking);
  askingRef.current = asking;
  const close = () => {
    // While asking, Escape or a tap outside means keep editing.
    if (askingRef.current && dirtyRef.current) return setAsking(false);
    if (dirtyRef.current) return setAsking(true);
    onClose();
  };
  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);
  const closeRef = useRef(close);
  closeRef.current = close;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Phones: drag the sheet down to close it, like any bottom sheet. The drag starts in
  // the head, or in the body while it's scrolled to the top; a short one springs back,
  // and unsaved typing still asks first.
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(max-width: 859px)").matches) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let dy = 0;
    let mode: "idle" | "maybe" | "drag" = "idle";
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      if (e.touches.length !== 1 || t.closest("input, textarea, select, [contenteditable]")) return;
      const body = el.querySelector(".sheet-body");
      if (body?.contains(t) && body.scrollTop > 0) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = Date.now();
      dy = 0;
      mode = "maybe";
    };
    const move = (e: TouchEvent) => {
      if (mode === "idle") return;
      const ty = e.touches[0].clientY - y0;
      const tx = e.touches[0].clientX - x0;
      if (mode === "maybe") {
        if (Math.abs(ty) < 8 && Math.abs(tx) < 8) return;
        if (ty <= 0 || Math.abs(tx) > ty) return void (mode = "idle");
        mode = "drag";
        el.style.animation = "none";
        el.style.transition = "none";
      }
      e.preventDefault();
      dy = Math.max(0, ty);
      el.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (mode !== "drag") return void (mode = "idle");
      mode = "idle";
      const flick = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6;
      el.style.transition = "transform 0.2s ease";
      if ((dy > 120 || flick) && !dirtyRef.current) {
        el.style.transform = "translateY(100%)";
        setTimeout(() => onCloseRef.current(), 180);
      } else {
        el.style.transform = "";
        if (dy > 120 || flick) closeRef.current();
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  useEffect(() => {
    const me = Symbol();
    stack.push(me);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // Only the sheet on top answers Escape.
      if (e.key === "Escape" && stack[stack.length - 1] === me) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    // Focus moves into the sheet, and back to what opened it (a cover, say) once it closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = ref.current?.querySelector<HTMLElement>("[autofocus], [data-autofocus]");
    if (focusable) focusable.focus();
    else ref.current?.focus();
    return () => {
      stack.splice(stack.indexOf(me), 1);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className={`scrim ${side ? "right" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className={`sheet-head ${top ? "has-top" : ""}`}>
          {top ?? <h2>{title}</h2>}
          <button className="iconbtn" onClick={close} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        {asking && dirty && (
          <div className="sheet-ask" role="alert">
            <span>Throw away what you typed?</span>
            <button ref={keepRef} className="btn" onClick={() => setAsking(false)}>
              Keep editing
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                onDiscard?.();
                onClose();
              }}
            >
              Throw it away
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  );
}
