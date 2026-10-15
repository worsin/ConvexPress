import { createFileRoute } from "@tanstack/react-router";

import type { Id } from "@backend/convex/_generated/dataModel";
import { FormEntryDetail } from "@/extensions/forms/components/FormEntryDetail";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { asId } from "@/lib/utils";

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
        key={`${formId}:${entryId}`}
        formId={asId<"forms">(formId)}
        entryId={asId<"form_submissions">(entryId)}
      />
    </PluginGuard>
  );
}
