import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";
import CoreAuthReset, {
  type AuthResetSubmitInput,
  type AuthResetSurfaceData,
} from "@/templates/packs/core/surfaces/auth.reset";
import { Surface } from "@/templates/sdk/Surface";

const resetPasswordSearchSchema = z.object({
  /** Token passed in the reset email link. */
  token: z.string().optional(),
  /** Email address passed in the reset email link. */
  email: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  head: () => buildRestrictedPageHead({
    title: siteTitled("Reset Password"),
    path: "/reset-password",
  }),
  component: ResetPasswordComponent,
});

/**
 * Reset Password route.
 *
 * Handles three states, rendered by the `auth.reset` surface:
 *   1. Token + email present -> Show password reset form
 *   2. Success -> Password was reset successfully
 *   3. No token -> Direct navigation, guide user to request a reset link
 */
function ResetPasswordComponent() {
  const { token, email: urlEmail } = Route.useSearch();
  const completePasswordReset = useAction(api.password.actions.completePasswordReset);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(input: AuthResetSubmitInput) {
    if (!token) return;
    setError("");

    // Client-side validation
    const trimmedEmail = input.email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (input.newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (input.newPassword !== input.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await completePasswordReset({
        email: trimmedEmail,
        token,
        newPassword: input.newPassword,
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      const convexError = err as { data?: { message?: string } };
      const message =
        convexError?.data?.message ??
        "Failed to reset password. The link may have expired. Please request a new one.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const data: AuthResetSurfaceData = {
    mode: isSuccess ? "success" : token ? "form" : "request",
    initialEmail: urlEmail ?? "",
    error,
    isSubmitting,
    actions: { submit },
  };

  return <Surface name="auth.reset" data={data} fallback={CoreAuthReset} />;
}
