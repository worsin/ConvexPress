import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/collections")({
  component: KBCollectionsPage,
});

function KBCollectionsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Collections</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Collection management with drag-and-drop article ordering will be
          implemented by the Admin List Table UI Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
