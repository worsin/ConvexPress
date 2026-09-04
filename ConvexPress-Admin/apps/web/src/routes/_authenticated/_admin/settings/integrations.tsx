/**
 * /settings/integrations — the same Integrations hub as /setup, mounted under
 * Settings. Child routes (stripe, paypal, clerk, google, shipping…) render
 * their full pages through the outlet.
 */

import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";

import { IntegrationsHub } from "@/components/integrations/hub/IntegrationsHub";

export const Route = createFileRoute("/_authenticated/_admin/settings/integrations")({
  component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
  const location = useLocation();
  const atIndex = location.pathname.replace(/\/$/, "") === "/settings/integrations";
  if (!atIndex) return <Outlet />;
  return (
    <div className="w-full p-6">
      <IntegrationsHub eyebrow="Settings" />
    </div>
  );
}
