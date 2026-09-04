import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";
import { siteTitled } from "@/lib/seo/head";

export const Route = createFileRoute("/dashboard/help")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: siteTitled("Help center") },
    ],
  }),
  component: () => <DashboardPage id="help" />,
});
