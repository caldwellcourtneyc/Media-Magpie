// How a form inside the item sheet says it has unsaved changes, so closing the sheet can ask first.
import { useEffect, useRef } from "react";

export type DirtyFn = (dirty: boolean) => void;

/** Reports whether a form differs from where it started, and clears the flag when the form closes. */
export function useReportDirty(onDirty: DirtyFn | undefined, changed: boolean) {
  const cb = useRef(onDirty);
  cb.current = onDirty;
  useEffect(() => cb.current?.(changed), [changed]);
  useEffect(() => () => cb.current?.(false), []);
}
