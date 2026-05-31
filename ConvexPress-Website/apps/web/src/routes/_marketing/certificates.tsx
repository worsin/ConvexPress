import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/certificates")({
  component: CertificatesLayout,
});

function CertificatesLayout() {
  return (
    <PublicPluginGate pluginId="lms">
      <Outlet />
    </PublicPluginGate>
  );
}
