import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { useClerk } from "@clerk/clerk-react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { UserProfile } from "@/lib/dashboard/types";
import { extractErrorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogMedia,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteAccountDialogProps {
  user: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirmation dialog for self-service account deletion.
 * The ONLY acceptable popup in the dashboard (destructive action exception).
 * Requires typing email to confirm.
 *
 * Uses Base UI AlertDialog for proper focus trapping and accessibility.
 *
 * On confirm:
 *   1. Calls deleteUser mutation with contentAction: "reassign"
 *   2. Signs out via Clerk (invalidates session)
 *   3. Redirects to homepage
 */
export function DeleteAccountDialog({
  user,
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const { signOut } = useClerk();

  const emailMatches =
    confirmEmail.toLowerCase() === user.email.toLowerCase();

  const deleteUser = useMutation(api.profiles.mutations.deleteUser);

  const handleDelete = useCallback(async () => {
    if (!emailMatches) return;

    setIsDeleting(true);
    try {
      // Delete the user account, reassigning content to admin
      await deleteUser({
        userId: user._id as Id<"users">,
        deleteContent: false,
      });

      toast.success("Account deleted successfully");
      onOpenChange(false);

      // Properly invalidate the Clerk session before redirect
      try {
        await signOut();
      } catch {
        // signOut may redirect or throw -- ensure we still navigate away
      }
      window.location.href = "/";
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, "Failed to delete account"));
    } finally {
      setIsDeleting(false);
    }
  }, [emailMatches, onOpenChange, deleteUser, user._id, signOut]);

  const handleClose = useCallback(() => {
    if (!isDeleting) {
      setConfirmEmail("");
      onOpenChange(false);
    }
  }, [isDeleting, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>
          <AlertDialogDescription>
            This action is permanent and cannot be undone. Your published
            content will be reassigned to the site administrator. Your draft
            content will be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm-email">
              Type your email to confirm:{" "}
              <span className="font-medium text-foreground">{user.email}</span>
            </Label>
            <Input
              id="delete-confirm-email"
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={user.email}
              autoComplete="off"
              className={cn(
                confirmEmail.length > 0 && !emailMatches && "border-destructive",
              )}
              aria-invalid={confirmEmail.length > 0 && !emailMatches}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={!emailMatches || isDeleting}
          >
            {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
            <span>{isDeleting ? "Deleting..." : "Delete My Account"}</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
