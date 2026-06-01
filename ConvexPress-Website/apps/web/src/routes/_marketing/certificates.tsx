import { Outlet, createFileRoute } from "@tanstack/react-router";

import { LmsRoutePending } from "@/components/lms/LmsRoutePending";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/certificates")({
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
