import { createFileRoute } from "@tanstack/react-router";
import { DirectCarrierIntegrationPage } from "@/components/integrations/shipping/DirectCarrierIntegrationPage";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/shipping/fedex",
)({
  component: FedExShippingIntegrationPage,
});

function FedExShippingIntegrationPage() {
  return <DirectCarrierIntegrationPage provider="fedex" />;
}
