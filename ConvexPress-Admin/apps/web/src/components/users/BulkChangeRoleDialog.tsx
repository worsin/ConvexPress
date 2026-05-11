/**
 * Bulk Change Role Dialog
 *
 * Dialog for changing the role of multiple users at once.
 * Uses Base UI Dialog (NOT Radix) per project standards.
 */

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation } from "convex/react";
import { LoaderIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { RoleSelector } from "@/components/roles/role-selector";

interface BulkChangeRoleDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** Array of user IDs to change roles for. */
  userIds: Id<"users">[];
  /** Callback when the role change is complete. */
  onComplete: () => void;
}

export function BulkChangeRoleDialog({
  open,
  onClose,
  userIds,
  onComplete,
}: BulkChangeRoleDialogProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);

  const bulkChangeRoleMutation = useMutation(api.profiles.mutations.bulkChangeRole);

  async function handleConfirm() {
    if (!selectedRoleId) {
      toast.error("Please select a role");
      return;
    }

    setIsExecuting(true);
    try {
      const result = await bulkChangeRoleMutation({
        userIds,
        newRoleId: selectedRoleId as Id<"roles">,
      });

      if (result.updated > 0) {
        toast.success(`Changed role for ${result.updated} user${result.updated === 1 ? "" : "s"}`);
      }

      if (result.errors.length > 0) {
        const errorCount = result.errors.length;
        toast.warning(`${errorCount} user${errorCount === 1 ? "" : "s"} could not be updated`);
      }

      onComplete();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to change roles";
      toast.error(message);
    } finally {
      setIsExecuting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      onClose();
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95"
        >
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-none bg-primary/10">
              <UsersIcon className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                Change Role
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs text-muted-foreground">
                Change the role for {userIds.length} selected user{userIds.length === 1 ? "" : "s"}.
              </DialogPrimitive.Description>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="bulk-role-select" className="block text-xs font-medium text-foreground mb-1.5">
              New Role
            </label>
            <RoleSelector
              id="bulk-role-select"
              value={selectedRoleId}
              onChange={setSelectedRoleId}
              disabled={isExecuting}
            />
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
              size="sm"
              onClick={handleConfirm}
              disabled={isExecuting || !selectedRoleId}
            >
              {isExecuting && (
                <LoaderIcon className="mr-1.5 size-3 animate-spin" />
              )}
              Change Role
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
