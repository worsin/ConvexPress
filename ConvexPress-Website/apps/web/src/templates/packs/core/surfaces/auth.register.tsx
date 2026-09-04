/**
 * Core · auth.register — create an account: the registration gate (open /
 * invite-only / closed, invitation banner), OAuth buttons, divider and the
 * Clerk-driven RegisterForm, inside the auth frame.
 */
import { AuthDivider } from "@/components/auth/AuthDivider";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { RegistrationGate } from "@/components/auth/RegistrationGate";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface AuthRegisterSurfaceData {
  /** Invitation token from the URL, when any. */
  token?: string;
  /** Sanitized destination after sign-up. */
  returnTo: string;
}

export default function CoreAuthRegister({ data }: SurfaceProps<AuthRegisterSurfaceData>) {
  return (
    <AuthPageLayout
      title="Create Account"
      description="Join our community."
      maxWidth="md"
    >
      <RegistrationGate token={data.token}>
        <OAuthButtons mode="signup" returnTo={data.returnTo} />
        <AuthDivider />
        <RegisterForm returnTo={data.returnTo} />
      </RegistrationGate>
    </AuthPageLayout>
  );
}
