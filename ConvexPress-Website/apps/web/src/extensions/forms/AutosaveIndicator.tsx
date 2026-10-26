/**
 * Form Multi-Step — quiet autosave status surface.
 *
 * Reflects the wizard's saveState. `role="status"` (polite): announced by AT
 * without stealing focus, never blocks input. Theme tokens only; state conveyed
 * by icon + text (not color alone).
 */

import { AlertCircle, Check, CloudOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** "held-back": saved, except answers the server refused (they keep their last valid value). */
export type SaveState = "idle" | "saving" | "saved" | "held-back" | "save-error";

interface AutosaveIndicatorProps {
  saveState: SaveState;
  /** Epoch ms of the last successful save (for the "Saved" relative label). */
  savedAt?: number | null;
  /** Labels of the answers a "held-back" save did not keep. */
  heldBackLabels?: readonly string[];
}

function relativeTime(savedAt: number | null | undefined): string {
  if (!savedAt) return "";
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

export function AutosaveIndicator({ saveState, savedAt, heldBackLabels = [] }: AutosaveIndicatorProps) {
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
        saveState === "save-error" || saveState === "held-back" ? "text-destructive" : "text-muted-foreground",
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
      ) : saveState === "held-back" ? (
        <>
          <AlertCircle className="size-3.5" aria-hidden="true" />
          {heldBackLabels.length === 1
            ? `Saved, except ${heldBackLabels[0]}: check that answer`
            : `Saved, except ${heldBackLabels.length} answers to check`}
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
