import { createFileRoute } from "@tanstack/react-router";

import { CustomerListTable } from "@/components/commerce/CustomerListTable";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/customers/",
)({
  component: CommerceCustomersPage,
});

function CommerceCustomersPage() {
  return <CustomerListTable />;
}
