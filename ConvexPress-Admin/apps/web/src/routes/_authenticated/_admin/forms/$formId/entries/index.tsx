import { createFileRoute } from "@tanstack/react-router";

import type { Id } from "@backend/convex/_generated/dataModel";
import { FormEntriesPage } from "@/extensions/forms/components/FormEntriesPage";
import { PluginGuard } from "@/components/plugins/PluginGuard";

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/entries/",
)({
  component: EntriesRoute,
});

function EntriesRoute() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <FormEntriesPage formId={formId as Id<"forms">} />
    </PluginGuard>
  );
}
