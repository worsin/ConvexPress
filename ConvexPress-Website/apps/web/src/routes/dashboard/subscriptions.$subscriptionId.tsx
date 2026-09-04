import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard/subscriptions/$subscriptionId")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: SubscriptionDetailRoute,
});

function SubscriptionDetailRoute() {
  const { subscriptionId } = Route.useParams();
  return <DashboardPage id="subscriptions" subpath={`/${subscriptionId}`} />;
}
