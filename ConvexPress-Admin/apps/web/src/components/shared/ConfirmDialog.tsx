import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertTriangleIcon, LoaderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** Confirm handler. */
  onConfirm: () => void;
  /** Dialog title (e.g., "Delete permanently?"). */
  title: string;
  /** Dialog message. */
  message: string;
  /** Confirm button label. Default: "Confirm". */
  confirmLabel?: string;
  /** Whether the confirm action is destructive. Default: false. */
  destructive?: boolean;
  /** Whether the action is currently executing (shows spinner). */
  isExecuting?: boolean;
}

/**
 * The ONLY allowed dialog in the system. Used exclusively for
 * destructive action confirmations (Delete Permanently, Empty Trash).
 *
 * Uses Base UI Dialog (NOT Radix).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  isExecuting = false,
}: ConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95"
        >
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-none",
                destructive ? "bg-destructive/10" : "bg-muted",
              )}
            >
              <AlertTriangleIcon
                className={cn(
                  "size-5",
                  destructive
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              />
            </div>
            <div className="flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs text-muted-foreground">
                {message}
              </DialogPrimitive.Description>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              size="sm"
              onClick={onConfirm}
              disabled={isExecuting}
            >
              {isExecuting && (
                <LoaderIcon className="mr-1.5 size-3 animate-spin" />
              )}
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
