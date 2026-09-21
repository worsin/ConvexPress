/**
 * Depot · auth.login — sign in inside the Depot auth frame: the provider
 * error as a bordered notice, OAuth buttons, divider, then the Clerk-driven
 * `LoginForm` (compact fields, full-width primary button via the frame).
 */
import { AuthDivider } from "@/components/auth/AuthDivider";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import type { AuthLoginSurfaceData } from "@/templates/packs/core/surfaces/auth.login";
import type { SurfaceProps } from "@/templates/sdk/types";

export default function DepotAuthLogin({ data }: SurfaceProps<AuthLoginSurfaceData>) {
  return (
    <AuthPageLayout title="Sign in" description="Sign in to access your account, orders and lists.">
      {data.errorMessage && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
          {data.errorMessage}
        </div>
      )}
      <OAuthButtons mode="signin" returnTo={data.returnTo} />
      <AuthDivider />
      <LoginForm returnTo={data.returnTo} />
    </AuthPageLayout>
  );
}
