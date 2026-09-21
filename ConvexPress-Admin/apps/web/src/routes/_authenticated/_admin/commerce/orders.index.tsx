import { createFileRoute } from "@tanstack/react-router";

import { OrderListTable } from "@/components/commerce/OrderListTable";

export const Route = createFileRoute("/_authenticated/_admin/commerce/orders/")(
  {
    component: CommerceOrdersPage,
  },
);

function CommerceOrdersPage() {
  return <OrderListTable />;
}
