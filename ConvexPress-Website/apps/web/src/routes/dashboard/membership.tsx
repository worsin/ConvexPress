import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { DashboardPage } from "@/dashboard/DashboardPage";
import { siteTitled } from "@/lib/seo/head";

export const Route = createFileRoute("/dashboard/membership")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: siteTitled("My Membership") },
    ],
  }),
  loader: async ({ context: { queryClient } }) => {
    // Prefetch both queries so SSR renders a fully-populated dashboard
    // instead of a flash of skeletons.
    await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(api.membership.queries.getMyMembership, {}),
      ),
      queryClient.ensureQueryData(
        convexQuery(api.membership.queries.listPublicPlans, {}),
      ),
    ]);
  },
  component: () => <DashboardPage id="membership" />,
});
