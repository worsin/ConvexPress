import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard/orders/$orderId/return")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: OrderReturnRoute,
});

function OrderReturnRoute() {
  const { orderId } = Route.useParams();
  return <DashboardPage id="orders" subpath={`/${orderId}/return`} />;
}
