/**
 * Form Multi-Step — quiet autosave status surface.
 *
 * Reflects the wizard's saveState. `role="status"` (polite): announced by AT
 * without stealing focus, never blocks input. Theme tokens only; state conveyed
 * by icon + text (not color alone).
 */

import { Check, CloudOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "save-error";

interface AutosaveIndicatorProps {
  saveState: SaveState;
  /** Epoch ms of the last successful save (for the "Saved" relative label). */
  savedAt?: number | null;
}

function relativeTime(savedAt: number | null | undefined): string {
  if (!savedAt) return "";
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

export function AutosaveIndicator({ saveState, savedAt }: AutosaveIndicatorProps) {
  if (saveState === "idle") {
    return <div role="status" aria-live="polite" data-slot="autosave" className="h-4" />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="autosave"
      data-state={saveState}
      className={cn(
        "flex items-center gap-1.5 text-xs",
        saveState === "save-error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {saveState === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Saving…
        </>
      ) : saveState === "saved" ? (
        <>
          <Check className="size-3.5 text-primary" aria-hidden="true" />
          Saved {relativeTime(savedAt)}
        </>
      ) : (
        <>
          <CloudOff className="size-3.5" aria-hidden="true" />
          Couldn&apos;t save — we&apos;ll retry
        </>
      )}
    </div>
  );
}
