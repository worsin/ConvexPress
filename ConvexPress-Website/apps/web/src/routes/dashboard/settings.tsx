import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/dashboard/DashboardPage";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => buildRestrictedPageHead({
    title: siteTitled("Account Settings"),
    path: "/dashboard/settings",
  }),
  component: () => <DashboardPage id="settings" />,
});
