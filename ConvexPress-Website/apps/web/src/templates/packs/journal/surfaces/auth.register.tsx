/**
 * Journal · auth.register — create an account inside the Journal auth frame:
 * the registration gate (open / invite-only / closed, invitation banner),
 * OAuth buttons, the divider and the Clerk-driven RegisterForm.
 */
import { AuthDivider } from "@/components/auth/AuthDivider";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { RegistrationGate } from "@/components/auth/RegistrationGate";
import type { AuthRegisterSurfaceData } from "@/templates/packs/core/surfaces/auth.register";
import type { SurfaceProps } from "@/templates/sdk/types";

export default function JournalAuthRegister({ data }: SurfaceProps<AuthRegisterSurfaceData>) {
  return (
    <AuthPageLayout title="Create an account" description="Join our community." maxWidth="md">
      <RegistrationGate token={data.token}>
        <OAuthButtons mode="signup" returnTo={data.returnTo} />
        <AuthDivider />
        <RegisterForm returnTo={data.returnTo} />
      </RegistrationGate>
    </AuthPageLayout>
  );
}
