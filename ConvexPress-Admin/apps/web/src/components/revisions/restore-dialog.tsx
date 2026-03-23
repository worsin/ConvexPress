import { getErrorMessage } from "@/lib/utils";
/**
 * RestoreDialog - Confirmation dialog for restoring a revision
 *
 * The ONLY dialog in the Revision System. Uses Base UI Dialog (NOT Radix).
 * Shows a confirmation before restoring, explaining that the current
 * content will be saved as a new revision first.
 *
 * This is a destructive action confirmation -- the one acceptable dialog type.
 */

import { useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface RestoreDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** The revision ID to restore. */
  revisionId: Id<"revisions">;
  /** The revision number being restored (for display). */
  revisionNumber: number;
  /** Callback after successful restore. */
  onRestored?: () => void;
}

export function RestoreDialog({
  open,
  onClose,
  revisionId,
  revisionNumber,
  onRestored,
}: RestoreDialogProps) {
  const [isPending, startTransition] = useTransition();
  const restoreMutation = useMutation(api.revisions.mutations.restore);

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await restoreMutation({ revisionId });
        toast.success(`Revision #${revisionNumber} restored successfully`);
        onClose();
        onRestored?.();
      } catch (error: unknown) {
        const message = getErrorMessage(error, "Failed to restore revision");
        toast.error(message);
      }
    });
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={`Restore Revision #${revisionNumber}?`}
      message="Are you sure you want to restore this revision? The current content will be saved as a new revision before restoring, so nothing will be lost."
      confirmLabel="Restore"
      destructive={false}
      isExecuting={isPending}
    />
  );
}
