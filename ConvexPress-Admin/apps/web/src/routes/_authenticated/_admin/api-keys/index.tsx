/**
 * API Keys Admin Page
 *
 * Full-page admin view for managing API keys.
 * Route: /admin/api-keys
 * Roles: Administrator only
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ApiKeyTable } from "./-components/api-key-table";

const apiKeysSearchSchema = z.object({
  status: z.enum(["active", "revoked", "expired"]).optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["name", "status", "lastUsed", "requests", "created"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/api-keys/")({
  validateSearch: apiKeysSearchSchema,
  component: ApiKeysPage,
});

function ApiKeysPage() {
  return <ApiKeyTable />;
}
