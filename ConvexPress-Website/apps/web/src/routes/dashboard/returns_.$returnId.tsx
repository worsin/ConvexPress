import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";

export const Route = createFileRoute("/dashboard/returns_/$returnId")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: ReturnDetailRoute,
});

function ReturnDetailRoute() {
  const { returnId } = Route.useParams();
  return <DashboardPage id="returns" subpath={`/${returnId}`} />;
}
