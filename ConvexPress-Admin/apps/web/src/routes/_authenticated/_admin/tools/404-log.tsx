/**
 * Tools > 404 Log
 *
 * Admin page listing all logged 404 entries with filtering, sorting, and pagination.
 * Allows creating redirects from 404 entries and dismissing entries.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NotFoundLogTable } from "@/components/routing/NotFoundLogTable";

const notFoundSearchSchema = z.object({
  resolved: z.boolean().optional(),
  minHits: z.number().optional(),
  sortBy: z.enum(["hitCount", "lastHitAt", "url"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/404-log",
)({
  validateSearch: notFoundSearchSchema,
  component: NotFoundLogPage,
});

function NotFoundLogPage() {
  return <NotFoundLogTable />;
}
