/**
 * useEditorKeyboardShortcuts - Global keyboard shortcuts for the editor
 *
 * Registers Ctrl+S (save) and Ctrl+Shift+P (preview) handlers.
 * Prevents default browser save dialog.
 *
 * Uses useRef to hold callback references so the keydown listener
 * is registered once and never re-attached when callbacks change.
 */

import { useEffect, useRef } from "react";

interface UseEditorKeyboardShortcutsOptions {
  /** Handler for save shortcut (Ctrl+S / Cmd+S) */
  onSave: () => void;
  /** Handler for preview shortcut (Ctrl+Shift+P / Cmd+Shift+P) */
  onPreview: () => void;
  /** Whether shortcuts are active */
  enabled: boolean;
}

export function useEditorKeyboardShortcuts(
  options: UseEditorKeyboardShortcutsOptions,
): void {
  const { onSave, onPreview, enabled } = options;

  // Stable refs for callbacks -- avoids re-registering the listener on every render
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!enabledRef.current) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Ctrl+S / Cmd+S -> Save
      if (isCtrlOrCmd && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        onSaveRef.current();
        return;
      }

      // Ctrl+Shift+P / Cmd+Shift+P -> Preview
      if (isCtrlOrCmd && e.shiftKey && e.key === "P") {
        e.preventDefault();
        onPreviewRef.current();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // Stable -- never re-registers
}
