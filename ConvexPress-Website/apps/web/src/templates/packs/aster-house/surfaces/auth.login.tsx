/**
 * Aster · auth.login — sign in inside the Aster auth frame: the provider
 * error (when any), OAuth buttons, the divider, and the Clerk-driven
 * LoginForm. The redirect for signed-in users and failed-login tracking live
 * in the route, as with Core.
 */
import { AuthDivider } from "@/components/auth/AuthDivider";
import { AuthError } from "@/components/auth/AuthError";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import type { AuthLoginSurfaceData } from "@/templates/packs/core/surfaces/auth.login";
import type { SurfaceProps } from "@/templates/sdk/types";

export default function AsterAuthLogin({ data }: SurfaceProps<AuthLoginSurfaceData>) {
  return (
    <AuthPageLayout title="Sign in" description="Sign in to access your account.">
      {data.errorMessage ? <AuthError message={data.errorMessage} /> : null}
      <OAuthButtons mode="signin" returnTo={data.returnTo} />
      <AuthDivider />
      <LoginForm returnTo={data.returnTo} />
    </AuthPageLayout>
  );
}
