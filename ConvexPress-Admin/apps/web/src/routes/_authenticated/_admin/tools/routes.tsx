/**
 * Tools > Routes
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RoutesListTable } from "@/components/tools/RoutesListTable";

const routesSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  app: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/routes",
)({
  validateSearch: routesSearchSchema,
  component: RoutesPage,
});

function RoutesPage() {
  return <RoutesListTable />;
}
