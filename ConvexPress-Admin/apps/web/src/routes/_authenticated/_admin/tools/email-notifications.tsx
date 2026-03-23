/**
 * Tools > Email Notifications
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { EmailNotificationsListTable } from "@/components/tools/EmailNotificationsListTable";

const emailSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/email-notifications",
)({
  validateSearch: emailSearchSchema,
  component: EmailNotificationsPage,
});

function EmailNotificationsPage() {
  return <EmailNotificationsListTable />;
}
