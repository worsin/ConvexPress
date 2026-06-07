import { Outlet, createFileRoute } from "@tanstack/react-router";

import { LmsRoutePending } from "@/components/lms/LmsRoutePending";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";

export const Route = createFileRoute("/_marketing/certificates")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "lms");
  },
  component: CertificatesLayout,
});

function CertificatesLayout() {
  return (
    <PublicPluginGate
      pluginId="lms"
      pendingFallback={<LmsRoutePending label="Loading certificates" />}
    >
      <Outlet />
    </PublicPluginGate>
  );
}
