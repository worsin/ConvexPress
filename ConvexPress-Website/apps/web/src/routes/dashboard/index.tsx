import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";

export const Route = createFileRoute("/dashboard/")({
  head: () => buildRestrictedPageHead({
    title: siteTitled("Dashboard"),
    path: "/dashboard",
  }),
  component: () => <DashboardPage id="home" />,
});
