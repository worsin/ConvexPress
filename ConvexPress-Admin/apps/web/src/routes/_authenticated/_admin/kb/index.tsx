import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { KBArticleListTable } from "@/components/kb/KBArticleListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const kbSearchSchema = z.object({
  status: z
    .enum(["draft", "review", "published", "archived"])
    .optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  categoryId: z.string().optional(),
  authorId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/kb/")({
  validateSearch: kbSearchSchema,
  component: KBPage,
});

function KBPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBArticleListTable />
    </RoutePermissionGuard>
  );
}
