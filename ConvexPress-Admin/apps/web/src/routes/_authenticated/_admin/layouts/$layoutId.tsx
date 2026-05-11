/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { asId } from "@/lib/utils";
import { LayoutComposer } from "@/components/layouts/LayoutComposer";
import { DeprecatedSystemBanner } from "@/components/appearance/DeprecatedSystemBanner";

export const Route = createFileRoute(
  "/_authenticated/_admin/layouts/$layoutId"
)({
  component: EditLayoutPage,
});

function EditLayoutPage() {
  const { layoutId } = Route.useParams();
  const layout = useQuery(api.layouts.queries.get, {
    id: asId<"layouts">(layoutId),
  });

  if (layout === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (layout === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Layout not found</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <DeprecatedSystemBanner />
      <LayoutComposer
        layoutId={layout._id}
        initialConfig={layout.config}
        initialName={layout.name}
        initialDescription={layout.description}
        layoutType={layout.type}
      />
    </div>
  );
}
