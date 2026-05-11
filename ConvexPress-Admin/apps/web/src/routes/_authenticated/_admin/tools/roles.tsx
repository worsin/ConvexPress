/**
 * Tools > Roles
 *
 * Uses the main RoleListTable component from roles/role-list.tsx.
 * The duplicate tools/RolesListTable.tsx has been removed (H-2 fix).
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RoleListTable } from "@/components/roles/role-list";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const rolesSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/roles",
)({
  validateSearch: rolesSearchSchema,
  component: RolesPage,
});

function RolesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/roles">
      <RoleListTable />
    </RoutePermissionGuard>
  );
}
