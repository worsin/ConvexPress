/**
 * AutosaveStatusBadge - Autosave state indicator
 *
 * Displays current autosave status: idle, saving, saved, or error.
 * Uses aria-live="polite" for screen reader announcements.
 */

import { cn } from "@/lib/utils";
import type { AutosaveState } from "@/types/editor";

interface AutosaveStatusBadgeProps {
  state: AutosaveState;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AutosaveStatusBadge({ state }: AutosaveStatusBadgeProps) {
  let label: string;
  let className: string;

  switch (state.status) {
    case "idle":
      label = state.lastSavedAt
        ? `Autosaved at ${formatTime(state.lastSavedAt)}`
        : "Saved";
      className = "text-muted-foreground";
      break;
    case "saving":
      label = "Saving...";
      className = "text-muted-foreground animate-pulse";
      break;
    case "saved":
      label = state.lastSavedAt
        ? `Autosaved at ${formatTime(state.lastSavedAt)}`
        : "Saved";
      className = "text-primary transition-colors duration-1000";
      break;
    case "error":
      label = "Error saving";
      className = "text-destructive";
      break;
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("text-xs inline-flex items-center gap-1.5", className)}
    >
      {state.status === "saving" && (
        <span className="inline-block size-1.5 rounded-full bg-current" />
      )}
      {state.status === "error" && (
        <span className="inline-block size-1.5 rounded-full bg-destructive" />
      )}
      {label}
    </span>
  );
}
