import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, CheckCircle } from "lucide-react";
import { z } from "zod";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { AuthLink } from "@/components/auth/AuthLink";

const resetPasswordSearchSchema = z.object({
  /** Token passed in the reset email link (if present). */
  token: z.string().optional(),
  /** Success flag set after password reset is completed. */
  success: z.stringbool().optional().catch(undefined),
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
        title: "Reset Password - SmithHarper",
      },
    ],
  }),
  component: ResetPasswordComponent,
});

/**
 * Reset Password route.
 *
 * Clerk handles the password reset flow via its hosted pages or custom flows.
 * If a user lands here (e.g., from a bookmark or direct navigation),
 * they are guided to use the forgot-password flow or sign in.
 *
 * Handles three states:
 *   1. ?success=true  -- Password was successfully reset. Show success message.
 *   2. ?token=...     -- Token present (from reset email). Guide user.
 *   3. No params      -- Direct navigation. Guide user to request a reset link.
 */
function ResetPasswordComponent() {
  const { success, token } = Route.useSearch();

  // State 1: Password successfully reset
  if (success) {
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

  // State 2: Token present (user came from reset email)
  if (token) {
    return (
      <AuthPageLayout
        title="Reset Your Password"
        description="Complete your password reset."
      >
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-none bg-muted">
            <KeyRound className="size-6 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-foreground">
              Password reset is handled securely by our authentication provider.
            </p>
            <p className="text-xs text-muted-foreground">
              If you were redirected here, your reset link may have expired or
              is being processed. Please check your email for the most recent
              reset link, or request a new one below.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2">
            <AuthLink to="/forgot-password">Request a New Reset Link</AuthLink>
          </div>

          <AuthLink to="/login">Back to Sign In</AuthLink>
        </div>
      </AuthPageLayout>
    );
  }

  // State 3: Direct navigation (no token, no success)
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
            Password reset is handled securely by our authentication provider.
          </p>
          <p className="text-xs text-muted-foreground">
            If you received a reset link via email, please click that link to
            reset your password. The link will take you to a secure page where
            you can set a new password.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Don't have a reset link?
          </p>
          <AuthLink to="/forgot-password">Request a New Reset Link</AuthLink>
        </div>

        <AuthLink to="/login">Back to Sign In</AuthLink>
      </div>
    </AuthPageLayout>
  );
}
