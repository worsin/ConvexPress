import { useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { KeyRound, Clock, RotateCcw } from "lucide-react";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface ResetPasswordButtonProps {
  /** The target user's Convex document ID. */
  targetUserId: Id<"users">;
  /** The target user's email address (for display in confirmation dialog). */
  targetEmail: string;
  /** The target user's display name (for display). */
  targetDisplayName?: string;
}

/**
 * Admin "Reset Password" button with confirmation dialog.
 *
 * Allows administrators to trigger a password reset email for another user.
 * The admin can NEVER see or set the user's password -- they can only
 * trigger the system to send a reset email.
 *
 * Displays:
 *   - Password status info (last changed date, total reset count)
 *   - "Reset Password" button
 *   - Confirmation dialog: "Send a password reset email to {email}?"
 *   - Success/error toast after action completes
 *
 * Uses Base UI Dialog (via ConfirmDialog shared component).
 * No Radix UI. No hardcoded colors.
 */
export function ResetPasswordButton({
  targetUserId,
  targetEmail,
  targetDisplayName,
}: ResetPasswordButtonProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const adminResetUserPassword = useAction(
    api.password.actions.adminResetUserPassword,
  );
  const passwordStatus = useQuery(api.password.queries.getPasswordStatus, {
    userId: targetUserId,
  });

  const handleConfirm = async () => {
    setIsExecuting(true);
    try {
      await adminResetUserPassword({ targetUserId });
      toast.success(`Password reset email sent to ${targetEmail}`);
      setIsConfirmOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to send password reset email";
      toast.error(message);
    } finally {
      setIsExecuting(false);
    }
  };

  const displayName = targetDisplayName || targetEmail;

  return (
    <div className="space-y-3">
      {/* Password Status Info */}
      {passwordStatus && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            {passwordStatus.lastPasswordChangedAt ? (
              <span>
                Last changed:{" "}
                <span className="font-medium text-foreground">
                  {new Date(
                    passwordStatus.lastPasswordChangedAt,
                  ).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </span>
            ) : (
              <span>Password has never been changed</span>
            )}
          </div>
          {passwordStatus.passwordResetCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RotateCcw className="size-3 shrink-0" />
              <span>
                Total resets:{" "}
                <span className="font-medium text-foreground">
                  {passwordStatus.passwordResetCount}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Reset Password Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsConfirmOpen(true)}
      >
        <KeyRound className="size-3.5" />
        <span>Reset Password</span>
      </Button>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="Reset User Password"
        message={`Send a password reset email to ${displayName} (${targetEmail})? They will receive an email with a link to set a new password. Their current password will remain active until they complete the reset.`}
        confirmLabel="Send Reset Email"
        isExecuting={isExecuting}
      />
    </div>
  );
}
