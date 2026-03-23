/**
 * Post Revisions Page - /admin/posts/$postId/revisions
 *
 * Full-page revision comparison screen for posts.
 * Uses the shared RevisionComparison component (issue #61).
 *
 * WordPress equivalent: revision.php (Revision comparison screen)
 */

import { createFileRoute, useParams } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { RevisionComparison } from "@/components/revisions/revision-comparison";

export const Route = createFileRoute(
  "/_authenticated/_admin/posts/$postId/revisions",
)({
  component: PostRevisionsPage,
});

function PostRevisionsPage() {
  const { postId } = useParams({
    from: "/_authenticated/_admin/posts/$postId/revisions",
  });

  const { can } = useAuth();
  const canRestore = can("revision.restore") && can("post.update");

  return (
    <RevisionComparison
      contentType="post"
      contentId={postId}
      canRestore={canRestore}
    />
  );
}
