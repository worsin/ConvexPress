import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard/orders_/$orderId_/return")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: OrderReturnRoute,
});

function OrderReturnRoute() {
  const { orderId } = Route.useParams();
  return <DashboardPage id="orders" subpath={`/${orderId}/return`} />;
}
