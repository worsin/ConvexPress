/**
 * Navigation guard hook for unsaved changes.
 *
 * Prevents accidental navigation away from settings pages with unsaved changes.
 * Uses TanStack Router's useBlocker for in-app navigation and the browser's
 * beforeunload event for tab close / back button.
 *
 * When autoSaveStatus is "pending" or "saving", the guard is skipped because
 * autosave will handle persisting the changes momentarily (Fix #96).
 *
 * Updated: Migrated from deprecated { blockerFn, condition } overload
 * to the current { shouldBlockFn } API (TanStack Router v1.141.x+).
 */

import { useEffect } from "react";
import { useBlocker } from "@tanstack/react-router";

import type { SettingsAutosaveStatus } from "@/hooks/useSettingsForm";

interface UseNavigationGuardOptions {
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Current autosave status. When "pending" or "saving", navigation is allowed. */
  autoSaveStatus?: SettingsAutosaveStatus;
}

export function useNavigationGuard(
  isDirtyOrOptions: boolean | UseNavigationGuardOptions,
): void {
  // Support both old signature (boolean) and new signature (options object)
  const { isDirty, autoSaveStatus } =
    typeof isDirtyOrOptions === "boolean"
      ? { isDirty: isDirtyOrOptions, autoSaveStatus: undefined as SettingsAutosaveStatus | undefined }
      : isDirtyOrOptions;

  // When autosave is pending or actively saving, the data will be persisted
  // imminently -- don't block navigation for the brief dirty window.
  const autosaveWillHandle =
    autoSaveStatus === "pending" || autoSaveStatus === "saving";

  const shouldBlock = isDirty && !autosaveWillHandle;

  // TanStack Router navigation guard (in-app links)
  // Uses shouldBlockFn (current API) instead of deprecated blockerFn+condition
  useBlocker({
    shouldBlockFn: () => {
      if (!shouldBlock) return false;
      return !window.confirm(
        "You have unsaved changes. Are you sure you want to leave?",
      );
    },
  });

  // Browser navigation guard (close tab, back button, address bar)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (shouldBlock) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldBlock]);
}
