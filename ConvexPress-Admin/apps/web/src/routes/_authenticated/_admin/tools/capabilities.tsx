/**
 * Tools > Capabilities
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CapabilitiesListTable } from "@/components/tools/CapabilitiesListTable";

const capabilitiesSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/capabilities",
)({
  validateSearch: capabilitiesSearchSchema,
  component: CapabilitiesPage,
});

function CapabilitiesPage() {
  return <CapabilitiesListTable />;
}
