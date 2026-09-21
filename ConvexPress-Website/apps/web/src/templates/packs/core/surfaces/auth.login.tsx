/**
 * Core · auth.login — sign in: OAuth buttons, divider and the Clerk-driven
 * LoginForm (which follows the site's sign-in configuration), inside the
 * auth frame. The redirect for signed-in users and failed-login tracking
 * live in the route.
 */
import { AuthDivider } from "@/components/auth/AuthDivider";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface AuthLoginSurfaceData {
  /** Error carried back by the auth provider (?error=…), already made user-friendly. */
  errorMessage?: string;
  /** Sanitized destination after sign-in. */
  returnTo: string;
}

export default function CoreAuthLogin({ data }: SurfaceProps<AuthLoginSurfaceData>) {
  return (
    <AuthPageLayout
      title="Sign In"
      description="Sign in to access your account."
    >
      {data.errorMessage && (
        <div className="mb-4 border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {data.errorMessage}
        </div>
      )}
      <OAuthButtons mode="signin" returnTo={data.returnTo} />
      <AuthDivider />
      <LoginForm returnTo={data.returnTo} />
    </AuthPageLayout>
  );
}
