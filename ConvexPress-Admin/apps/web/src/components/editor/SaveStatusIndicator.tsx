/**
 * SaveStatusIndicator - Inline save status display
 *
 * Shows the current save status: idle, unsaved, saving, saved, error.
 * Alternative to AutosaveStatusBadge for placement inside the editor area.
 */

import type { AutosaveState } from "@/types/editor";

interface SaveStatusIndicatorProps {
  state: AutosaveState;
}

export function SaveStatusIndicator({ state }: SaveStatusIndicatorProps) {
  const { status, lastSavedAt, error } = state;

  const label = (() => {
    switch (status) {
      case "idle":
        return lastSavedAt
          ? `Last saved ${formatTime(lastSavedAt)}`
          : "No unsaved changes";
      case "saving":
        return "Saving...";
      case "saved":
        return lastSavedAt
          ? `Autosaved at ${formatTime(lastSavedAt)}`
          : "Saved";
      case "error":
        return error || "Autosave failed";
    }
  })();

  const colorClass = (() => {
    switch (status) {
      case "idle":
        return "text-muted-foreground";
      case "saving":
        return "text-muted-foreground";
      case "saved":
        return "text-muted-foreground";
      case "error":
        return "text-destructive";
    }
  })();

  return (
    <span className={`text-[10px] ${colorClass}`} aria-live="polite">
      {status === "saving" && (
        <span className="inline-block size-2 border border-current border-t-transparent rounded-full animate-spin mr-1 align-middle" />
      )}
      {label}
    </span>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
