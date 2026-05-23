import { createFileRoute } from "@tanstack/react-router";
import { SalesChannelsPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/sales-channels")({
  component: SalesChannelsPage,
});
