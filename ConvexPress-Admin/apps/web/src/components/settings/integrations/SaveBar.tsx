/**
 * SaveBar — sticky bottom bar for settings pages. Disables Save when the
 * form is clean; shows Discard to revert.
 */

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
}: SaveBarProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onDiscard}
            disabled={!dirty || saving}
          >
            Discard
          </Button>
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
        </div>
      </div>
    </div>
  );
}
