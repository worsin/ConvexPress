/**
 * Pending Comments - /admin/comments/pending
 *
 * Convenience route pre-filtered to the Pending tab.
 * Same as All Comments but with status=pending by default.
 */

import { createFileRoute } from "@tanstack/react-router";

import { CommentListTable } from "@/components/comments/CommentListTable";

export const Route = createFileRoute(
  "/_authenticated/_admin/comments/pending",
)({
  component: PendingCommentsPage,
});

function PendingCommentsPage() {
  return <CommentListTable defaultStatus="pending" />;
}
