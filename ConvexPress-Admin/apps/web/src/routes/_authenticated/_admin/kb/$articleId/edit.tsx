import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/$articleId/edit")({
  component: EditKBArticlePage,
});

function EditKBArticlePage() {
  const { articleId } = Route.useParams();

  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Edit Article</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Article ID: {articleId}. Full editor will be implemented by the Content Editor
          System Expert using the shared TipTap editor component.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
