import { createFileRoute } from "@tanstack/react-router";
import { DraftOrdersPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/draft-orders")({
  component: DraftOrdersPage,
});
