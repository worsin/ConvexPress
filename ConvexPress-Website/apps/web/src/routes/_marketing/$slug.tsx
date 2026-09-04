import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useEffect } from "react";

import { DashboardPathHost } from "@/dashboard/DashboardPathHost";
import { usePageOverrides } from "@/contexts/PageOverridesContext";
import { resolveDashboardConfig, stripBasePath } from "@/lib/dashboard/config";

/**
 * Pretty page URLs: /our-story → /page/our-story.
 *
 * The redirect happens in the loader, so it runs during SSR and the visitor's
 * first response is the real page with its own <title> and meta (a client-side
 * <Navigate/> shipped an empty shell first, which crawlers and link previews saw).
 *
 * Dashboard base path: a single-segment base path (e.g. `/account`) matches
 * this dynamic route before the top-level splat (routes/$.tsx). When the slug
 * equals the configured base path the loader hands off to the dashboard host
 * instead of redirecting, hiding the marketing chrome for that render.
 */
export const Route = createFileRoute("/_marketing/$slug")({
  loader: async ({ context: { queryClient }, params, location }) => {
    try {
      const settings = (await queryClient.ensureQueryData(
        convexQuery(api.settings.queries.getPublic, {}),
      )) as { dashboardConfig?: Record<string, unknown> | null } | null;
      const config = resolveDashboardConfig(settings?.dashboardConfig);
      if (config.basePath !== "/dashboard" && stripBasePath(`/${params.slug}`, config.basePath) === "") {
        return { dashboard: true as const };
      }
    } catch {
      // Settings unavailable: treat as a page slug.
    }
    // Keep the query string: template / Customizer previews and campaign tags survive the redirect.
    throw redirect({ to: "/page/$", params: { _splat: params.slug }, search: location.search as any, replace: true });
  },
  component: SlugDashboardHost,
});

function SlugDashboardHost() {
  const { setOverrides } = usePageOverrides();
  useEffect(() => {
    setOverrides({ hideHeader: true, hideFooter: true, fullWidth: true });
    return () => setOverrides({});
  }, [setOverrides]);
  return <DashboardPathHost remainder="" />;
}
