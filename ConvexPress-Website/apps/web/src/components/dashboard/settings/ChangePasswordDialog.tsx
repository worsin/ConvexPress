/**
 * ChangePasswordDialog — change (or add) the account password in place through
 * Clerk, instead of bouncing to the forgot-password flow (which redirects
 * signed-in users straight back to settings).
 */

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { clerkErrorMessage, useUser } from "@/lib/auth/clerk";
import { passwordPolicyErrors } from "@/lib/auth/capabilities";

import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import { AuthError } from "@/components/auth/AuthError";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useUser();
  const capabilities = useAuthCapabilities();
  const hasPassword = Boolean(user?.passwordEnabled);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!user) return setError("Your session is not ready yet. Please try again.");
    if (hasPassword && !currentPassword) return setError("Enter your current password.");
    const problems = passwordPolicyErrors(newPassword, capabilities.password);
    if (problems.length > 0) return setError(problems.join(" "));
    if (newPassword !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await user.updatePassword({
        newPassword,
        ...(hasPassword ? { currentPassword } : {}),
        signOutOfOtherSessions: true,
      });
      toast.success(hasPassword ? "Password changed." : "Password added to your account.");
      reset();
      onOpenChange(false);
    } catch (cause) {
      setError(clerkErrorMessage(cause, "The password could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, autoComplete: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
          className="pr-8"
        />
        <button
          type="button"
          onClick={() => setShow((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? "Hide passwords" : "Show passwords"}
        >
          {show ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" aria-hidden="true" />
            {hasPassword ? "Change password" : "Add a password"}
          </DialogTitle>
          <DialogDescription>
            {hasPassword
              ? "Other devices will be signed out after the change."
              : "You currently sign in with an external provider. Adding a password also enables email sign-in."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error && <AuthError message={error} />}
          {hasPassword && field("current-password", "Current password", currentPassword, setCurrentPassword, "current-password")}
          <div className="flex flex-col gap-1.5">
            {field("new-password", "New password", newPassword, setNewPassword, "new-password")}
            <PasswordStrengthIndicator password={newPassword} />
          </div>
          {field("confirm-password", "Confirm new password", confirm, setConfirm, "new-password")}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : hasPassword ? "Change password" : "Add password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
