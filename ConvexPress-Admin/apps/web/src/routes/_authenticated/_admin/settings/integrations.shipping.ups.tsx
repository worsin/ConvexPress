import { createFileRoute } from "@tanstack/react-router";
import { DirectCarrierIntegrationPage } from "@/components/integrations/shipping/DirectCarrierIntegrationPage";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/integrations/shipping/ups",
)({
  component: UpsShippingIntegrationPage,
});

function UpsShippingIntegrationPage() {
  return <DirectCarrierIntegrationPage provider="ups" />;
}
