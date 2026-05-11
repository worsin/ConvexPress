import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PostListTable } from "@/components/posts/PostListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const postSearchSchema = z.object({
  status: z
    .enum(["publish", "draft", "pending", "future", "private", "trash", "mine"])
    .optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["title", "author", "comments", "date"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  authorId: z.string().optional(),
  categoryId: z.string().optional(),
  dateRange: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/posts/")({
  validateSearch: postSearchSchema,
  component: PostsPage,
});

function PostsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/posts">
      <PostListTable />
    </RoutePermissionGuard>
  );
}
