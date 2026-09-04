import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { DashboardPathHost } from "@/dashboard/DashboardPathHost";
import { resolveDashboardConfig, stripBasePath } from "@/lib/dashboard/config";
import { resolvePageFromRemainder } from "@/dashboard/nav";
import { buildRestrictedPageHead, siteTitled } from "@/lib/seo/head";

/**
 * Configurable dashboard base path — the top-level splat route.
 *
 * TanStack Router ranks routes static > dynamic > splat, so this file only
 * runs when nothing else matched. Its loader reads the public settings; when
 * the requested path sits under `dashboardConfig.basePath` (and that path is
 * not the built-in `/dashboard`, which has its own file routes) it renders the
 * dashboard shell plus the page module for the remainder. Otherwise it throws
 * `notFound()` and the root not-found page renders exactly as before.
 *
 * One wrinkle: a single-segment base path such as `/account` is claimed by
 * the pretty-page route `_marketing/$slug.tsx` before this splat is
 * considered (dynamic beats splat). That route checks the base path and hands
 * off to the same <DashboardPathHost/> — see the note there. Everything
 * deeper (`/account/orders/1`) lands here.
 */
export const Route = createFileRoute("/$")({
  loader: async ({ context: { queryClient }, location }) => {
    const settings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { dashboardConfig?: Record<string, unknown> | null } | null;
    const config = resolveDashboardConfig(settings?.dashboardConfig);
    if (config.basePath === "/dashboard") throw notFound();
    const remainder = stripBasePath(location.pathname, config.basePath);
    if (remainder === null) throw notFound();

    // Resolve the page title for <head> without an extra round trip later.
    let title = "Dashboard";
    try {
      const registry = (await queryClient.ensureQueryData(
        convexQuery(api.extensions.dashboard.queries.registry, {}),
      )) as { pages: Parameters<typeof resolvePageFromRemainder>[1] } | null;
      const match = registry ? resolvePageFromRemainder(remainder, registry.pages, config.landingPage) : null;
      if (match) title = match.page.title;
    } catch {
      // Registry unavailable: generic title.
    }
    return { remainder, basePath: config.basePath, title };
  },
  head: ({ loaderData }) =>
    buildRestrictedPageHead({
      title: siteTitled(loaderData?.title ?? "Dashboard"),
      path: loaderData ? `${loaderData.basePath}${loaderData.remainder}` : "/",
    }),
  component: SplatDashboard,
});

function SplatDashboard() {
  const { remainder } = Route.useLoaderData();
  return <DashboardPathHost remainder={remainder} />;
}
