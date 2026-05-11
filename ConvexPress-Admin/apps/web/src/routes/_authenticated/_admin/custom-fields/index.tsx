/**
 * Custom Fields - Field Groups List
 * Route: /admin/custom-fields
 *
 * WordPress equivalent: /wp-admin/edit.php?post_type=acf-field-group
 * Displays all field groups in a WordPress-style list table.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { FieldGroupList } from "@/components/custom-fields/FieldGroupList";

const customFieldsSearchSchema = z.object({
  status: z.enum(["active", "inactive", "all"]).optional(),
  search: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/custom-fields/",
)({
  validateSearch: customFieldsSearchSchema,
  component: CustomFieldsPage,
});

function CustomFieldsPage() {
  return <FieldGroupList />;
}
