/**
 * Tools > Redirects
 *
 * Admin page listing all redirect rules with filtering, sorting, and pagination.
 * Full page (no modals) following WordPress-style list table patterns.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RedirectListTable } from "@/components/routing/RedirectListTable";

const redirectsSearchSchema = z.object({
  source: z
    .enum(["manual", "slug_change", "permalink_change", "import"])
    .optional(),
  enabled: z.boolean().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(["sourceUrl", "hitCount", "createdAt", "lastHitAt"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/redirects/",
)({
  validateSearch: redirectsSearchSchema,
  component: RedirectsPage,
});

function RedirectsPage() {
  return <RedirectListTable />;
}
