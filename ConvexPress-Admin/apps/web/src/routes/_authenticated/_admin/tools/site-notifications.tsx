/**
 * Tools > Site Notifications
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SiteNotificationsListTable } from "@/components/tools/SiteNotificationsListTable";

const siteNotifSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/site-notifications",
)({
  validateSearch: siteNotifSearchSchema,
  component: SiteNotificationsPage,
});

function SiteNotificationsPage() {
  return <SiteNotificationsListTable />;
}
