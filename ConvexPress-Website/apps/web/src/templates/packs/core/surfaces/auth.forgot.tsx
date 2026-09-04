/**
 * Core · auth.forgot — request a password reset link: the email form, then
 * the "check your inbox" confirmation once submitted.
 */
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ForgotPasswordSuccess } from "@/components/auth/ForgotPasswordSuccess";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface AuthForgotSurfaceData {
  /** The address a reset was requested for; null until the form succeeds. */
  submittedEmail: string | null;
  /** Called by the form after the reset request (always succeeds, to prevent enumeration). */
  onSubmitted: (email: string) => void;
}

export default function CoreAuthForgot({ data }: SurfaceProps<AuthForgotSurfaceData>) {
  const { submittedEmail, onSubmitted } = data;

  return (
    <AuthPageLayout
      title="Forgot Password"
      description={
        submittedEmail
          ? undefined
          : "Enter your email to receive a reset link."
      }
    >
      {submittedEmail ? (
        <ForgotPasswordSuccess email={submittedEmail} />
      ) : (
        <>
          <ForgotPasswordForm onSuccess={onSubmitted} />
          <div className="text-center">
            <AuthLink to="/login">Back to Sign In</AuthLink>
          </div>
        </>
      )}
    </AuthPageLayout>
  );
}
