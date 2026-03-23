/**
 * Webhooks Admin Page
 *
 * Full-page admin view for managing outbound webhooks.
 * Route: /admin/webhooks
 * Roles: Administrator only
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { WebhookTable } from "./-components/webhook-table";

const webhooksSearchSchema = z.object({
  status: z.enum(["active", "paused", "disabled"]).optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["name", "status", "lastDelivery", "failures"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/webhooks/")({
  validateSearch: webhooksSearchSchema,
  component: WebhooksPage,
});

function WebhooksPage() {
  return <WebhookTable />;
}
