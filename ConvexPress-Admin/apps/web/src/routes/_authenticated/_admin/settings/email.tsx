/**
 * Email Settings Page
 *
 * Comprehensive email notification management for administrators.
 * Displays stats overview, template list, and delivery queue monitor.
 *
 * Route: /admin/settings/email
 * Capability: manage_options (enforced by settings layout parent)
 */

import { createFileRoute } from "@tanstack/react-router";

import { EmailSettingsPage } from "@/components/settings/email/EmailSettingsPage";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/email",
)({
  component: EmailSettingsPage,
});
