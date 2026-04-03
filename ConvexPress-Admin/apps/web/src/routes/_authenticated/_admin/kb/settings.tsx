import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/settings")({
  component: KBSettingsPage,
});

function KBSettingsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Settings</h1>
        <p className="text-[var(--color-muted-foreground)]">
          KB settings forms (general, features, search) will be implemented
          by the Admin Settings UI Expert using the shared settings form patterns.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
