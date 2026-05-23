import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/pricing")({
  component: PricingPage,
});
