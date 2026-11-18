"use client";

import { useCallback, useRef, useState } from "react";

export type Toast = { id: number; msg: string; bad?: boolean; action?: { label: string; fn: () => void } };
export type ToastFn = (msg: string, opts?: { bad?: boolean; action?: Toast["action"] }) => void;

/** The short messages at the bottom of the screen: the newest three, each gone by itself (later when it offers an action). */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);
  const toast = useCallback<ToastFn>((msg, opts) => {
    const id = ++tid.current;
    setToasts((ts) => [...ts.slice(-2), { id, msg, ...opts }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), opts?.action ? 7000 : 3500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  return { toasts, toast, dismiss };
}
