/**
 * Deactivate User Dialog
 *
 * Confirmation dialog for deactivating a user account.
 * Includes an optional reason field (recorded in audit log).
 *
 * Uses Base UI Dialog (NOT Radix).
 */

import { useState, useEffect } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertTriangleIcon, LoaderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDeactivateUser } from "@/hooks/users/useUserMutations";
import type { Id } from "@backend/convex/_generated/dataModel";

interface DeactivateUserDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** The user being deactivated. */
  user: {
    _id: Id<"users">;
    displayName?: string;
    email: string;
  };
  /** Called after successful deactivation. */
  onDeactivated?: () => void;
}

export function DeactivateUserDialog({
  open,
  onClose,
  user,
  onDeactivated,
}: DeactivateUserDialogProps) {
  const [reason, setReason] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);

  const deactivateUser = useDeactivateUser();

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setReason("");
      setIsDeactivating(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setIsDeactivating(true);
    const success = await deactivateUser({
      userId: user._id,
      reason: reason.trim() || undefined,
    });

    setIsDeactivating(false);
    if (success) {
      onClose();
      onDeactivated?.();
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95"
        >
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center bg-destructive/10">
              <AlertTriangleIcon className="size-5 text-destructive" />
            </div>
            <div className="flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                Deactivate User
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs text-muted-foreground">
                Deactivating{" "}
                <strong>{user.displayName || user.email}</strong> will prevent
                them from logging in. Their content will remain published. This
                action can be reversed.
              </DialogPrimitive.Description>
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="deactivate-reason"
              className="mb-1 block text-xs font-medium text-foreground"
            >
              Reason (optional)
            </label>
            <textarea
              id="deactivate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Violation of terms of service"
              rows={3}
              className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50 resize-none"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              This reason is recorded in the audit log.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isDeactivating}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              disabled={isDeactivating}
            >
              {isDeactivating && (
                <LoaderIcon className="mr-1.5 size-3 animate-spin" />
              )}
              Deactivate User
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
