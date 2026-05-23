import { createFileRoute } from "@tanstack/react-router";
import { CustomerGroupsPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/customer-groups")({
  component: CustomerGroupsPage,
});
