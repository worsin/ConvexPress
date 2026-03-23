import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { UserListTable } from "@/components/users/UserListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const userSearchSchema = z.object({
  status: z
    .enum(["administrator", "editor", "author", "contributor", "subscriber"])
    .optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["username", "name", "email", "role", "posts"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/users/")({
  validateSearch: userSearchSchema,
  component: UsersPage,
});

function UsersPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/users">
      <UserListTable />
    </RoutePermissionGuard>
  );
}
