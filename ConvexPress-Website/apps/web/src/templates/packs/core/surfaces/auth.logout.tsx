/** Core · auth.logout — the "signing you out" interstitial shown while Clerk signs out. */
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import type { SurfaceProps } from "@/templates/sdk/types";

export type AuthLogoutSurfaceData = Record<string, never>;

export default function CoreAuthLogout(_props: SurfaceProps<AuthLogoutSurfaceData>) {
  return (
    <AuthPageLayout title="Signing Out" showLogo={false}>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="size-5 animate-spin rounded-none border-2 border-muted border-t-primary" />
        <p className="text-xs text-muted-foreground">
          Signing you out...
        </p>
      </div>
    </AuthPageLayout>
  );
}
