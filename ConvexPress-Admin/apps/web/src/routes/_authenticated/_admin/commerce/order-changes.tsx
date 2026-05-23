import { createFileRoute } from "@tanstack/react-router";
import { OrderChangesPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/order-changes")({
  component: OrderChangesPage,
});
