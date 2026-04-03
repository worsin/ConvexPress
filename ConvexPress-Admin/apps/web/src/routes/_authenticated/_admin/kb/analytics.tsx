import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/analytics")({
  component: KBAnalyticsPage,
});

function KBAnalyticsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Analytics</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Analytics dashboard with charts for views, search queries,
          and feedback will be implemented by the Dashboard System Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
