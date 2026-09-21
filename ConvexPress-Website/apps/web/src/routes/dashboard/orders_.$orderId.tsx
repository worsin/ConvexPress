import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard/orders_/$orderId")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  const { orderId } = Route.useParams();
  return <DashboardPage id="orders" subpath={`/${orderId}`} />;
}
