import { useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { Id } from "@backend/convex/_generated/dataModel";

interface MenuDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  menuId: Id<"menus">;
  menuName: string;
  onDeleted?: () => void;
}

/**
 * Delete confirmation dialog for menus.
 * The ONLY acceptable popup in the menu system (destructive confirmation).
 * Uses useTransition for pending state during deletion.
 */
export function MenuDeleteDialog({
  open,
  onClose,
  menuId,
  menuName,
  onDeleted,
}: MenuDeleteDialogProps) {
  const deleteMenu = useMutation(api.menus.mutations.deleteMenu);
  const [isExecuting, startExecuting] = useTransition();

  const handleConfirm = () => {
    startExecuting(async () => {
      try {
        await deleteMenu({ menuId });
        toast.success(`Menu "${menuName}" deleted`);
        onClose();
        onDeleted?.();
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete menu",
        );
      }
    });
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={`Delete "${menuName}"?`}
      message="This will permanently delete all menu items and unassign it from any locations. This action cannot be undone."
      confirmLabel="Delete"
      destructive
      isExecuting={isExecuting}
    />
  );
}
