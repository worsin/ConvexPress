/**
 * useUnsavedChangesWarning - Browser beforeunload + TanStack Router blocker
 *
 * Registers a beforeunload handler and TanStack Router navigation blocker
 * when the form has unsaved changes.
 */

import { useEffect } from "react";
import { useBlocker } from "@tanstack/react-router";

interface UseUnsavedChangesWarningOptions {
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether the warning is enabled (disable during submission) */
  enabled: boolean;
}

export function useUnsavedChangesWarning(
  options: UseUnsavedChangesWarningOptions,
): void {
  const { isDirty, enabled } = options;

  const shouldBlock = isDirty && enabled;

  // Browser beforeunload warning (for tab close, reload, etc.)
  useEffect(() => {
    if (!shouldBlock) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldBlock]);

  // TanStack Router navigation blocker (for SPA navigation)
  useBlocker({
    shouldBlockFn: () => shouldBlock,
    withResolver: false,
  });
}
