/**
 * AutosaveRecoveryDialog - Autosave recovery prompt
 *
 * Shown when a user opens a post for editing and a newer autosave exists.
 * Mirrors WordPress's autosave recovery behavior:
 *   "There is an autosave of this post that is more recent than the version below."
 *   [View the autosave] [Dismiss]
 *
 * This is a non-modal banner (not a popup), displayed at the top of the editor
 * as a prominent notification. The user can choose to restore the autosaved
 * content or dismiss the notice.
 */

import { useCallback, useState } from "react";

interface AutosaveRecoveryDialogProps {
  /** Timestamp of the autosaved content */
  autosavedAt: number;
  /** Timestamp of the last manual save */
  lastSavedAt: number;
  /** Callback to restore autosaved content */
  onRestore: () => void;
  /** Callback to dismiss the notice (keep current version) */
  onDismiss: () => void;
}

export function AutosaveRecoveryDialog({
  autosavedAt,
  lastSavedAt,
  onRestore,
  onDismiss,
}: AutosaveRecoveryDialogProps) {
  const [dismissed, setDismissed] = useState(false);

  // Don't show if dismissed or if autosave is not newer
  if (dismissed || autosavedAt <= lastSavedAt) {
    return null;
  }

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss();
  }, [onDismiss]);

  const handleRestore = useCallback(() => {
    setDismissed(true);
    onRestore();
  }, [onRestore]);

  const autosaveDate = new Date(autosavedAt);
  const formattedDate = autosaveDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      role="alert"
      className="border border-primary/30 bg-primary/5 px-4 py-3 mb-4 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
        <p className="text-sm text-foreground">
          There is an autosave of this post that is more recent than the version
          below.{" "}
          <span className="text-muted-foreground">
            (Autosaved at {formattedDate})
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleRestore}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Restore autosave
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
