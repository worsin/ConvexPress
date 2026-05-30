/**
 * Form Analytics route — /admin/forms/$formId/analytics
 *
 * Per-form funnel dashboard + entry CSV export (Form Analytics & Export System).
 * Gated behind auth + the `forms` PluginGuard. The funnel read requires
 * `form.view_analytics`; the export button requires `form.export_entries`.
 */

import { createFileRoute } from "@tanstack/react-router";

import type { Id } from "@backend/convex/_generated/dataModel";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { FormAnalyticsPage } from "@/extensions/forms/components/FormAnalyticsPage";

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/analytics/",
)({
  component: FormAnalyticsRoute,
});

function FormAnalyticsRoute() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <FormAnalyticsPage formId={formId as Id<"forms">} />
    </PluginGuard>
  );
}
