/**
 * Journal · auth.reset — set a new password from a reset link, inside the
 * Journal auth frame. Same three modes as Core (form / success / request),
 * one underline field per row, a pill submit. Field drafts and the show/hide
 * toggle are local; validation and the reset action live in the route.
 */
import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AuthError } from "@/components/auth/AuthError";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import type { AuthResetSurfaceData } from "@/templates/packs/core/surfaces/auth.reset";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, LinkButton, UnderlineInput } from "../parts";
import { FormField } from "../parts/extra-plugins";

export default function JournalAuthReset({ data }: SurfaceProps<AuthResetSurfaceData>) {
  if (data.mode === "success") {
    return (
      <AuthPageLayout title="Password reset" description="Your password has been reset successfully.">
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <p className="text-sm leading-7 text-foreground">Your password has been reset. Please sign in with your new password.</p>
          <LinkButton to="/login" variant="primary">
            Sign in
          </LinkButton>
        </div>
      </AuthPageLayout>
    );
  }

  if (data.mode === "form") {
    return <ResetPasswordForm data={data} />;
  }

  return (
    <AuthPageLayout title="Reset your password" description="Follow the steps below to reset your password.">
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-7 text-foreground">To reset your password, you need a reset link sent to your email.</p>
          <p className="text-xs leading-6 text-muted-foreground">If you received a reset link via email, please click that link. It will bring you back here with the information needed to set a new password.</p>
        </div>
        <LinkButton to="/forgot-password" variant="primary" className="w-full">
          Request a reset link
        </LinkButton>
        <AuthLink to="/login">Back to sign in</AuthLink>
      </div>
    </AuthPageLayout>
  );
}

function ResetPasswordForm({ data }: { data: AuthResetSurfaceData }) {
  const { initialEmail, error, isSubmitting, actions } = data;

  const [email, setEmail] = useState(initialEmail);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void actions.submit({ email, newPassword, confirmPassword });
  };

  return (
    <AuthPageLayout title="Set a new password" description="Enter your new password below.">
      <form data-slot="reset-password-form" className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        {error ? <AuthError message={error} /> : null}

        <FormField label="Email address" htmlFor="reset-email" hint={initialEmail ? "Email address from your reset link." : undefined}>
          <UnderlineInput id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={!!initialEmail} className="disabled:opacity-60" />
        </FormField>

        <FormField label="New password" htmlFor="reset-new-password">
          <div className="relative">
            <UnderlineInput
              id="reset-new-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              autoFocus
              required
              className="pr-9"
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <PasswordStrengthIndicator password={newPassword} />
        </FormField>

        <FormField label="Confirm password" htmlFor="reset-confirm-password" error={mismatch ? "Passwords don't match" : undefined}>
          <UnderlineInput
            id="reset-confirm-password"
            type={showPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
            aria-invalid={mismatch ? true : undefined}
            className={mismatch ? "border-destructive" : undefined}
          />
        </FormField>

        <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Resetting..." : "Reset password"}
        </Button>

        <div className="flex flex-col items-center gap-2">
          <AuthLink to="/forgot-password">Request a new reset link</AuthLink>
          <AuthLink to="/login">Back to sign in</AuthLink>
        </div>
      </form>
    </AuthPageLayout>
  );
}
