/**
 * PermalinkChangeDialog - Confirmation dialog before saving permalink changes.
 *
 * Warns about SEO impact and bookmark breakage when changing permalink structure.
 * This is an acceptable use of a dialog (destructive confirmation flow).
 *
 * Uses Base UI Dialog (NOT Radix) for proper accessibility:
 * - Focus trap within the dialog
 * - Escape key closes the dialog
 * - Click outside closes the dialog
 * - ARIA alertdialog role
 */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PermalinkChangeDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  oldStructure: string;
  newStructure: string;
}

export function PermalinkChangeDialog({
  open,
  onConfirm,
  onCancel,
  oldStructure,
  newStructure,
}: PermalinkChangeDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95"
        >
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-none bg-warning/10">
              <TriangleAlert className="size-5 text-warning" />
            </div>
            <div className="flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                Confirm Permalink Change
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs text-muted-foreground space-y-2">
                <p>
                  Changing the permalink structure will affect all existing post URLs.
                  This may impact SEO rankings and break existing bookmarks or external
                  links to your content.
                </p>
                <div className="space-y-1">
                  <p>
                    <span className="text-foreground font-medium">Old structure:</span>{" "}
                    <code className="bg-muted px-1 py-0.5 font-mono">
                      {oldStructure}
                    </code>
                  </p>
                  <p>
                    <span className="text-foreground font-medium">New structure:</span>{" "}
                    <code className="bg-muted px-1 py-0.5 font-mono">
                      {newStructure}
                    </code>
                  </p>
                </div>
              </DialogPrimitive.Description>

              <div className="mt-4 flex items-center gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onConfirm}>
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
