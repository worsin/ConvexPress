/**
 * Page Revisions Page - /admin/pages/$pageId/revisions
 *
 * Full-page revision comparison screen for pages.
 * Uses the shared RevisionComparison component (issue #61).
 *
 * WordPress equivalent: revision.php (Revision comparison screen for pages)
 */

import { createFileRoute, useParams } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { RevisionComparison } from "@/components/revisions/revision-comparison";

export const Route = createFileRoute(
  "/_authenticated/_admin/pages/$pageId/revisions",
)({
  component: PageRevisionsPage,
});

function PageRevisionsPage() {
  const { pageId } = useParams({
    from: "/_authenticated/_admin/pages/$pageId/revisions",
  });

  const { can } = useAuth();
  const canRestore = can("revision.restore") && can("page.update");

  return (
    <RevisionComparison
      contentType="page"
      contentId={pageId}
      canRestore={canRestore}
    />
  );
}
