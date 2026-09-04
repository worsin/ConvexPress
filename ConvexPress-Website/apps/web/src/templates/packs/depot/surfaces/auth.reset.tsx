/**
 * Depot · auth.reset — set a new password inside the Depot auth frame. Three
 * modes as in Core: the form (token present), success, and the "request a
 * link" guidance for direct navigation. Field drafts and the show/hide
 * toggle are local; validation and the reset action live in the route.
 */
import { CheckCircle, Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";

import { AuthError } from "@/components/auth/AuthError";
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import type { AuthResetSurfaceData } from "@/templates/packs/core/surfaces/auth.reset";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, LinkButton } from "../parts";
import { Field, Input } from "../parts/extra-plugins";

export default function DepotAuthReset({ data }: SurfaceProps<AuthResetSurfaceData>) {
  if (data.mode === "success") {
    return (
      <AuthPageLayout title="Password reset complete" description="Your password has been reset successfully.">
        <div className="flex flex-col items-center gap-4 py-2 text-center" role="status">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CheckCircle className="size-5" aria-hidden="true" />
          </div>
          <p className="text-[13px] leading-5 text-foreground">Your password has been reset. Please log in with your new password.</p>
          <LinkButton to="/login" className="w-full">
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
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <KeyRound className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] leading-5 text-foreground">To reset your password, you need a reset link sent to your email.</p>
          <p className="text-xs leading-5 text-muted-foreground">If you received a reset link via email, please click that link. It will bring you back here with the information needed to set a new password.</p>
        </div>
        <LinkButton to="/forgot-password" className="w-full">
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void actions.submit({ email, newPassword, confirmPassword });
  };

  return (
    <AuthPageLayout title="Set new password" description="Enter your new password below.">
      <form data-slot="reset-password-form" className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {error && <AuthError message={error} className="rounded-md" />}

        <Field label="Email address" htmlFor="reset-email" hint={initialEmail ? "Email address from your reset link." : undefined}>
          <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={!!initialEmail} />
        </Field>

        <Field label="New password" htmlFor="reset-new-password">
          <div className="relative">
            <Input id="reset-new-password" type={showPassword ? "text" : "password"} placeholder="Enter new password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" autoFocus required className="pr-9" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <PasswordStrengthIndicator password={newPassword} />
        </Field>

        <Field label="Confirm password" htmlFor="reset-confirm-password" error={mismatch ? "Passwords don't match" : undefined}>
          <Input id="reset-confirm-password" type={showPassword ? "text" : "password"} placeholder="Confirm new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required aria-invalid={mismatch ? true : undefined} />
        </Field>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
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
