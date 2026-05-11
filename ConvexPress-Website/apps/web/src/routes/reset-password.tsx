import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { KeyRound, CheckCircle, Eye, EyeOff } from "lucide-react";
import { z } from "zod";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthError } from "@/components/auth/AuthError";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const resetPasswordSearchSchema = z.object({
  /** Token passed in the reset email link. */
  token: z.string().optional(),
  /** Email address passed in the reset email link. */
  email: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  head: () => ({
    meta: [
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        title: "Reset Password - ConvexPress",
      },
    ],
  }),
  component: ResetPasswordComponent,
});

/**
 * Reset Password route.
 *
 * Handles three states:
 *   1. Token + email present -> Show password reset form
 *   2. Success -> Password was reset successfully
 *   3. No token -> Direct navigation, guide user to request a reset link
 */
function ResetPasswordComponent() {
  const { token, email: urlEmail } = Route.useSearch();
  const [isSuccess, setIsSuccess] = useState(false);

  // State: Password successfully reset
  if (isSuccess) {
    return (
      <AuthPageLayout
        title="Password Reset Complete"
        description="Your password has been reset successfully."
      >
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-none bg-muted">
            <CheckCircle className="size-6 text-muted-foreground" />
          </div>

          <p className="text-sm text-foreground">
            Your password has been reset. Please log in with your new password.
          </p>

          <AuthLink to="/login">Sign In</AuthLink>
        </div>
      </AuthPageLayout>
    );
  }

  // State: Token present -- show the reset form
  if (token) {
    return (
      <ResetPasswordForm
        token={token}
        email={urlEmail ?? ""}
        onSuccess={() => setIsSuccess(true)}
      />
    );
  }

  // State: No token -- direct navigation, guide to forgot-password
  return (
    <AuthPageLayout
      title="Reset Your Password"
      description="Follow the steps below to reset your password."
    >
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-none bg-muted">
          <KeyRound className="size-6 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-foreground">
            To reset your password, you need a reset link sent to your email.
          </p>
          <p className="text-xs text-muted-foreground">
            If you received a reset link via email, please click that link. It
            will bring you back here with the information needed to set a new
            password.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <AuthLink to="/forgot-password">Request a Reset Link</AuthLink>
        </div>

        <AuthLink to="/login">Back to Sign In</AuthLink>
      </div>
    </AuthPageLayout>
  );
}

// ─── Reset Password Form ─────────────────────────────────────────────────────

interface ResetPasswordFormProps {
  token: string;
  email: string;
  onSuccess: () => void;
}

function ResetPasswordForm({ token, email: initialEmail, onSuccess }: ResetPasswordFormProps) {
  const completePasswordReset = useAction(api.password.actions.completePasswordReset);

  const [email, setEmail] = useState(initialEmail);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await completePasswordReset({
        email: trimmedEmail,
        token,
        newPassword,
      });
      onSuccess();
    } catch (err: unknown) {
      const convexError = err as { data?: { message?: string } };
      const message =
        convexError?.data?.message ??
        "Failed to reset password. The link may have expired. Please request a new one.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageLayout
      title="Set New Password"
      description="Enter your new password below."
    >
      <form
        data-slot="reset-password-form"
        className="flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
      >
        {error && <AuthError message={error} />}

        {/* Email (pre-filled from URL, editable if not provided) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-email">Email address</Label>
          <Input
            id="reset-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={!!initialEmail}
          />
          {initialEmail && (
            <p className="text-xs text-muted-foreground">
              Email address from your reset link.
            </p>
          )}
        </div>

        {/* New Password */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-new-password">New password</Label>
          <div className="relative">
            <Input
              id="reset-new-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              required
              className="pr-8"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-3.5" aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
          <PasswordStrengthIndicator password={newPassword} />
        </div>

        {/* Confirm Password */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-confirm-password">Confirm password</Label>
          <Input
            id="reset-confirm-password"
            type={showPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            aria-invalid={
              confirmPassword.length > 0 && newPassword !== confirmPassword
                ? true
                : undefined
            }
          />
          {confirmPassword.length > 0 && newPassword !== confirmPassword && (
            <p className="text-xs text-destructive" aria-live="polite">
              Passwords don't match
            </p>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Resetting..." : "Reset Password"}
        </Button>

        {/* Links */}
        <div className="flex flex-col items-center gap-2">
          <AuthLink to="/forgot-password">Request a New Reset Link</AuthLink>
          <AuthLink to="/login">Back to Sign In</AuthLink>
        </div>
      </form>
    </AuthPageLayout>
  );
}
