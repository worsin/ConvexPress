/**
 * Delete User Dialog
 *
 * Confirmation dialog for permanent user deletion.
 * Requires the admin to choose a content disposition:
 *   - Reassign all content to another user
 *   - Delete all content
 *
 * This is the ONLY dialog pattern allowed (destructive action confirmation).
 * Uses Base UI Dialog (NOT Radix).
 */

import { useState, useEffect } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertTriangleIcon, LoaderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDeleteUser } from "@/hooks/users/useUserMutations";
import type { Id } from "@backend/convex/_generated/dataModel";

interface DeleteUserDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** The user being deleted. */
  user: {
    _id: Id<"users">;
    displayName?: string;
    email: string;
  };
  /** Called after successful deletion. */
  onDeleted?: () => void;
}

interface UserOption {
  _id: Id<"users">;
  displayName?: string;
  email: string;
}

interface UserListResult {
  users?: UserOption[];
}

export function DeleteUserDialog({
  open,
  onClose,
  user,
  onDeleted,
}: DeleteUserDialogProps) {
  const [contentAction, setContentAction] = useState<
    "reassign" | "delete" | ""
  >("");
  const [reassignToId, setReassignToId] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteUser = useDeleteUser();

  // Fetch active users for reassignment dropdown (exclude the user being deleted)
  const usersResult = useQuery(api.profiles.queries.listUsers, {
    status: "active",
    perPage: 100,
  }) as UserListResult | undefined;
  const activeUsers = usersResult?.users?.filter(
    (u) => u._id !== user._id,
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setContentAction("");
      setReassignToId("");
      setIsDeleting(false);
    }
  }, [open]);

  const canConfirm =
    contentAction === "delete" ||
    (contentAction === "reassign" && reassignToId !== "");

  const handleConfirm = async () => {
    if (!canConfirm) return;

    setIsDeleting(true);
    const success = await deleteUser({
      userId: user._id,
      deleteContent: contentAction === "delete",
      reassignTo:
        contentAction === "reassign"
          ? (reassignToId as Id<"users">)
          : undefined,
    });

    setIsDeleting(false);
    if (success) {
      onClose();
      onDeleted?.();
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
                Delete User Permanently
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs text-muted-foreground">
                You are about to permanently delete{" "}
                <strong>{user.displayName || user.email}</strong>. This action
                cannot be undone.
              </DialogPrimitive.Description>
            </div>
          </div>

          {/* Content Disposition */}
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-foreground">
              What should be done with this user's content?
            </p>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="contentAction"
                value="reassign"
                checked={contentAction === "reassign"}
                onChange={() => setContentAction("reassign")}
                className="mt-0.5"
              />
              <div className="flex-1">
                <span className="text-xs font-medium text-foreground">
                  Reassign content to:
                </span>
                {contentAction === "reassign" && (
                  <select
                    value={reassignToId}
                    onChange={(e) => setReassignToId(e.target.value)}
                    className="mt-1 h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
                  >
                    <option value="">Select a user...</option>
                    {activeUsers?.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.displayName || u.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="contentAction"
                value="delete"
                checked={contentAction === "delete"}
                onChange={() => setContentAction("delete")}
                className="mt-0.5"
              />
              <div>
                <span className="text-xs font-medium text-foreground">
                  Delete all content
                </span>
                <p className="text-[10px] text-muted-foreground">
                  All posts, pages, and other content by this user will be
                  permanently removed.
                </p>
              </div>
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              disabled={!canConfirm || isDeleting}
            >
              {isDeleting && (
                <LoaderIcon className="mr-1.5 size-3 animate-spin" />
              )}
              Delete Permanently
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
