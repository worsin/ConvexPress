/** Depot · auth.logout — the "signing you out" interstitial in the Depot auth frame. */
import { Loader2 } from "lucide-react";

import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import type { AuthLogoutSurfaceData } from "@/templates/packs/core/surfaces/auth.logout";
import type { SurfaceProps } from "@/templates/sdk/types";

export default function DepotAuthLogout(_props: SurfaceProps<AuthLogoutSurfaceData>) {
  return (
    <AuthPageLayout title="Signing out" showLogo={false}>
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status" aria-live="polite">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-[13px] text-muted-foreground">Signing you out...</p>
      </div>
    </AuthPageLayout>
  );
}
