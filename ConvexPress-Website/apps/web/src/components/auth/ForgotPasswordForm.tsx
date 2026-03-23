import { useState, useTransition } from "react";
import { useAction } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthError } from "./AuthError";
import { cn } from "@/lib/utils";

interface ForgotPasswordFormProps {
  onSuccess: (email: string, oauthHint?: boolean) => void;
  className?: string;
}

/**
 * Email input form for initiating password reset.
 *
 * On submit, calls a Convex action that triggers the password reset
 * flow and records the request for audit purposes.
 *
 * Always shows a success message regardless of whether the email exists
 * to prevent email enumeration attacks.
 */
export function ForgotPasswordForm({
  onSuccess,
  className,
}: ForgotPasswordFormProps) {
  const requestPasswordReset = useAction(api.password.actions.requestPasswordReset);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Basic validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    startTransition(async () => {
      try {
        // Call Convex action to trigger password reset + record audit event.
        // The action always succeeds (email enumeration prevention) -- it silently
        // does nothing if the email doesn't exist in SmithHarper.
        // Returns { oauthHint: boolean } if the user registered via OAuth.
        const result = await requestPasswordReset({ email: trimmedEmail });
        const oauthHint = result && typeof result === "object" && "oauthHint" in result
          ? (result as { oauthHint?: boolean }).oauthHint
          : false;

        // Always show success to prevent email enumeration
        // Pass oauthHint so the parent can show an advisory message
        onSuccess(trimmedEmail, oauthHint ?? false);
      } catch {
        // Even on error, show success to prevent enumeration
        // Log the error internally but don't expose it to the user
        onSuccess(trimmedEmail);
      }
    });
  };

  return (
    <form
      data-slot="forgot-password-form"
      className={cn("flex flex-col gap-4", className)}
      onSubmit={handleSubmit}
      noValidate
    >
      {error && <AuthError message={error} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email">Email address</Label>
        <Input
          id="forgot-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isPending}
      >
        {isPending ? "Sending..." : "Send Reset Link"}
      </Button>
    </form>
  );
}
