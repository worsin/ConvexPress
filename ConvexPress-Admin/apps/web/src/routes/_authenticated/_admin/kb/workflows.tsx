import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/workflows")({
  component: KBWorkflowsPage,
});

function KBWorkflowsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Workflows</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Workflow builder with step configuration will be implemented by the
          Admin Settings UI Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
