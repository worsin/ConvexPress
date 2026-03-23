/**
 * Roles & Capabilities List Page
 *
 * Route: /admin/roles
 * Access: Administrator only
 *
 * Displays all roles in a WordPress-style list table with columns:
 * Role, Type, Level, Users, Capabilities, Status.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RoleListTable } from "@/components/roles/role-list";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const roleSearchSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["all", "internal", "customer"]).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/roles/")({
  validateSearch: roleSearchSchema,
  component: RolesPage,
});

function RolesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/roles">
      <RoleListTable />
    </RoutePermissionGuard>
  );
}
