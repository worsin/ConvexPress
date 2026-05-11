import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CommentListTable } from "@/components/comments/CommentListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const commentSearchSchema = z.object({
  status: z
    .enum(["pending", "approved", "spam", "trash"])
    .optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["author", "comment", "inResponseTo", "submittedOn"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  postId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/comments/")({
  validateSearch: commentSearchSchema,
  component: CommentsPage,
});

function CommentsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/comments">
      <CommentListTable />
    </RoutePermissionGuard>
  );
}
