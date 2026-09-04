import { createFileRoute } from "@tanstack/react-router";

import { IntegrationsHub } from "@/components/integrations/hub/IntegrationsHub";

/**
 * /setup — site readiness. Every provider this website depends on, whether
 * it is configured, and whether it actually answers. Also the first-admin
 * landing page after bootstrap.
 */
export const Route = createFileRoute("/_authenticated/_admin/setup")({
  component: () => <IntegrationsHub eyebrow="Site readiness" />,
});
