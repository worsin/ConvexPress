/**
 * Email Template Editor Route
 *
 * Full-page editor for an individual email template.
 * Route: /admin/settings/email/templates/$templateSlug
 * Capability: manage_options (enforced by settings layout parent)
 */

import { createFileRoute } from "@tanstack/react-router";

import { EmailTemplateEditorPage } from "@/components/settings/email/EmailTemplateEditorPage";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/email_/templates/$templateSlug",
)({
  component: EmailTemplateEditorPage,
});
