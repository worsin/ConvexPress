import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";
import { siteTitled } from "@/lib/seo/head";

/**
 * Support tickets live in dashboard/pages/tickets/ (owned by the
 * notifications + tickets stream). Until that module lands, DashboardPage
 * renders its "page unavailable" card; once dashboard/pages/tickets/manifest.tsx
 * exists this route lights up with no further changes.
 */
export const Route = createFileRoute("/dashboard/tickets")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: siteTitled("Support tickets") },
    ],
  }),
  component: () => <DashboardPage id="tickets" />,
});
