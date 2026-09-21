/** Aster · auth.logout — the "signing you out" interstitial shown while Clerk signs out. */
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import type { AuthLogoutSurfaceData } from "@/templates/packs/core/surfaces/auth.logout";
import type { SurfaceProps } from "@/templates/sdk/types";

import { SmallCaps } from "../parts";

export default function AsterAuthLogout(_props: SurfaceProps<AuthLogoutSurfaceData>) {
  return (
    <AuthPageLayout title="Signing out" showLogo={false}>
      <div className="flex flex-col items-center gap-4 py-4 text-center" role="status" aria-live="polite">
        <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
        <SmallCaps>Signing you out…</SmallCaps>
      </div>
    </AuthPageLayout>
  );
}
