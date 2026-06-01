import { createFileRoute } from "@tanstack/react-router";

import type { Id } from "@backend/convex/_generated/dataModel";
import { FormEntryDetail } from "@/extensions/forms/components/FormEntryDetail";
import { PluginGuard } from "@/components/plugins/PluginGuard";

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/entries/$entryId",
)({
  component: EntryDetailRoute,
});

function EntryDetailRoute() {
  const { formId, entryId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <FormEntryDetail
        formId={formId as Id<"forms">}
        entryId={entryId as Id<"form_submissions">}
      />
    </PluginGuard>
  );
}
