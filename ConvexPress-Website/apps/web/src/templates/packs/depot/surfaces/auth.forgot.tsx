/**
 * Depot · auth.forgot — request a password reset link inside the Depot auth
 * frame: the email form, then the "check your inbox" confirmation.
 */
import { AuthLink } from "@/components/auth/AuthLink";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ForgotPasswordSuccess } from "@/components/auth/ForgotPasswordSuccess";
import type { AuthForgotSurfaceData } from "@/templates/packs/core/surfaces/auth.forgot";
import type { SurfaceProps } from "@/templates/sdk/types";

export default function DepotAuthForgot({ data }: SurfaceProps<AuthForgotSurfaceData>) {
  const { submittedEmail, onSubmitted } = data;

  return (
    <AuthPageLayout title="Forgot password" description={submittedEmail ? undefined : "Enter your email to receive a reset link."}>
      {submittedEmail ? (
        <ForgotPasswordSuccess email={submittedEmail} />
      ) : (
        <>
          <ForgotPasswordForm onSuccess={onSubmitted} />
          <div className="text-center">
            <AuthLink to="/login">Back to sign in</AuthLink>
          </div>
        </>
      )}
    </AuthPageLayout>
  );
}
