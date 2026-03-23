import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PageListTable } from "@/components/pages/PageListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const pageSearchSchema = z.object({
  status: z
    .enum(["publish", "draft", "pending", "private", "trash", "future", "auto-draft"])
    .optional(),
  search: z.string().optional(),
  orderBy: z.enum(["title", "author", "comments", "date"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  authorId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/pages/")({
  validateSearch: pageSearchSchema,
  component: PagesPage,
});

function PagesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/pages">
      <PageListTable />
    </RoutePermissionGuard>
  );
}
