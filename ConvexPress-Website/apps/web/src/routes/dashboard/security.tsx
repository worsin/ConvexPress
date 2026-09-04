import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard/security")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: () => <DashboardPage id="security" />,
});
