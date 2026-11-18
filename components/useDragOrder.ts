"use client";

import { useEffect, useState, type DragEvent } from "react";
import type { Item } from "@/lib/types";
import { useApp } from "./App";

/**
 * Drag a cover to a new place in its list, where there's a mouse. A touch screen doesn't get it (a long
 * press lifts a draggable on iOS, and scrolling needs the finger); Move to top, up and down in the item
 * sheet work everywhere. A cover can only land in its own list, beside another cover.
 */
export function useDragOrder(items: Item[]) {
  const { moveItem } = useApp();
  const [mouse, setMouse] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; side: "before" | "after" } | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const f = () => setMouse(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const end = () => {
    setDragging(null);
    setOver(null);
  };
  return (i: Item) => {
    if (!mouse || items.length < 2) return {};
    return {
      draggable: true,
      "data-dragging": dragging === i.id ? "" : undefined,
      "data-drop": over?.id === i.id ? over.side : undefined,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", i.title);
        setDragging(i.id);
      },
      onDragEnd: end,
      onDragOver: (e: DragEvent) => {
        if (!dragging || dragging === i.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const r = e.currentTarget.getBoundingClientRect();
        const side = e.clientX < r.left + r.width / 2 ? "before" : "after";
        if (over?.id !== i.id || over.side !== side) setOver({ id: i.id, side });
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (dragging && over) moveItem(dragging, over.side === "before" ? { above: over.id } : { below: over.id });
        end();
      },
    };
  };
}
