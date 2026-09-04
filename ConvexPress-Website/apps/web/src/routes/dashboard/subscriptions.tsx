import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard/subscriptions")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: () => <DashboardPage id="subscriptions" />,
});
