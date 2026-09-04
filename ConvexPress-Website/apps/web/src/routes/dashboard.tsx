import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { DashboardShell } from "@/dashboard/DashboardShell";
import { legacyDashboardRedirect } from "@/lib/dashboard/config";

/**
 * Legacy `/dashboard` tree. Every child route keeps working at its URL; when
 * the site configures a different base path (dashboardConfig.basePath) the
 * loader redirects to the same page under that path and routes/$.tsx renders
 * it there. See design-kit/DASHBOARD.md ("Configurable base path").
 */
export const Route = createFileRoute("/dashboard")({
  loader: async ({ context: { queryClient }, location }) => {
    try {
      const settings = (await queryClient.ensureQueryData(
        convexQuery(api.settings.queries.getPublic, {}),
      )) as { dashboardConfig?: { basePath?: string } | null } | null;
      const target = legacyDashboardRedirect(
        location.pathname,
        settings?.dashboardConfig?.basePath ?? "/dashboard",
        location.searchStr,
      );
      if (target) throw redirect({ href: target, replace: true });
    } catch (error) {
      if (isRedirect(error)) throw error;
      // Settings unavailable: keep serving the legacy path.
    }
  },
  component: DashboardLayout,
});

function isRedirect(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "isRedirect" in error);
}

function DashboardLayout() {
  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}
