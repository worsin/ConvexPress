/**
 * Email Queue Detail Route
 *
 * Full-page detail view for a single email queue item.
 * Route: /admin/settings/email/queue/$queueId
 * Capability: manage_options (enforced by settings layout parent)
 */

import { createFileRoute } from "@tanstack/react-router";

import { EmailQueueDetailPage } from "@/components/settings/email/EmailQueueDetailPage";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/email_/queue/$queueId",
)({
  component: EmailQueueDetailPage,
});
