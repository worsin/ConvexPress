import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MediaListTable } from "@/components/media/MediaListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const mediaSearchSchema = z.object({
  status: z
    .enum(["images", "audio", "video", "documents", "unattached"])
    .optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["file", "author", "uploadedTo", "date"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  view: z.enum(["list", "grid"]).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/media/")({
  validateSearch: mediaSearchSchema,
  component: MediaPage,
});

function MediaPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/media">
      <MediaListTable />
    </RoutePermissionGuard>
  );
}
