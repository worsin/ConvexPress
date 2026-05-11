/**
 * SaveBar — sticky bottom bar for settings pages. Disables Save when the
 * form is clean; shows Discard to revert.
 */

import { Loader2 } from "lucide-react";

import type { DebouncedAutosaveStatus } from "@/hooks/useDebouncedAutosave";
import { Button } from "@/components/ui/button";

export interface SaveBarProps {
  dirty: boolean;
  saving?: boolean;
  onSave?: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  mode?: "manual" | "autosave";
  autosaveStatus?: DebouncedAutosaveStatus;
  autosaveError?: string | null;
}

function getStatusCopy({
  mode,
  dirty,
  saving,
  autosaveStatus,
  autosaveError,
}: {
  mode: "manual" | "autosave";
  dirty: boolean;
  saving: boolean;
  autosaveStatus?: DebouncedAutosaveStatus;
  autosaveError?: string | null;
}) {
  if (mode === "manual") {
    return dirty ? "You have unsaved changes." : "All changes saved.";
  }

  if (autosaveStatus === "error") {
    return autosaveError ?? "Autosave failed.";
  }
  if (autosaveStatus === "blocked") {
    return autosaveError ?? "Autosave paused until validation errors are fixed.";
  }
  if (saving || autosaveStatus === "saving") {
    return "Saving changes...";
  }
  if (autosaveStatus === "pending" || dirty) {
    return "Saving shortly...";
  }
  return "All changes saved.";
}

export function SaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  mode = "manual",
  autosaveStatus,
  autosaveError,
}: SaveBarProps) {
  const busy = mode === "autosave" ? autosaveStatus === "saving" : saving;
  const statusCopy = getStatusCopy({
    mode,
    dirty,
    saving,
    autosaveStatus,
    autosaveError,
  });

  return (
    <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p
          className={
            autosaveStatus === "error"
              ? "text-xs text-destructive"
              : autosaveStatus === "blocked"
                ? "text-xs text-warning"
                : "text-xs text-muted-foreground"
          }
        >
          {statusCopy}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onDiscard}
            disabled={!dirty || busy}
          >
            Discard
          </Button>
          {mode === "manual" && onSave ? (
            <Button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                saveLabel
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
