import { createFileRoute } from "@tanstack/react-router";

import type { Id } from "@backend/convex/_generated/dataModel";
import { FormEntriesPage } from "@/extensions/forms/components/FormEntriesPage";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { asId } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/forms/$formId/entries/",
)({
  component: EntriesRoute,
});

function EntriesRoute() {
  const { formId } = Route.useParams();
  return (
    <PluginGuard pluginId="forms">
      <FormEntriesPage formId={asId<"forms">(formId)} />
    </PluginGuard>
  );
}
