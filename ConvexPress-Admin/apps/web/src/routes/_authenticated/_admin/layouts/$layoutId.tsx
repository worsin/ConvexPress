import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { asId } from "@/lib/utils";
import { LayoutComposer } from "@/components/layouts/LayoutComposer";

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
    <LayoutComposer
      layoutId={layout._id}
      initialConfig={layout.config}
      initialName={layout.name}
      initialDescription={layout.description}
      layoutType={layout.type}
    />
  );
}
