/**
 * Keyboard shortcut hook for Ctrl+S / Cmd+S save.
 *
 * Prevents the browser's native "Save Page" dialog and triggers
 * the settings form save when the form has unsaved changes.
 *
 * Uses useRef to hold callback and state references so the keydown
 * listener is registered once and never re-attached.
 */

import { useEffect, useRef } from "react";

export function useKeyboardSave(
  onSave: () => Promise<void>,
  isDirty: boolean,
): void {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirtyRef.current) {
          onSaveRef.current();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // Stable -- never re-registers
}
