/**
 * Edit Field Group - Lazy-loaded component
 *
 * Full-page visual field group builder.
 */

import { createLazyFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { FieldGroupBuilder } from "@/components/custom-fields/FieldGroupBuilder";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/custom-fields/$groupId/edit",
)({
  component: EditFieldGroupPage,
});

function EditFieldGroupPage() {
  const { groupId } = useParams({
    from: "/_authenticated/_admin/custom-fields/$groupId/edit",
  });

  const typedGroupId = groupId as Id<"fieldGroups">;

  const group = useQuery(api.customFields.queries.getGroup, {
    groupId: typedGroupId,
  });
  const fields = useQuery(api.customFields.queries.getFieldsByGroup, {
    groupId: typedGroupId,
  });

  // Loading state
  if (group === undefined || fields === undefined) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  // Not found
  if (group === null) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Field Group Not Found
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          The field group you are looking for does not exist or has been deleted.
        </p>
        <Link
          to="/custom-fields"
          className="text-sm text-primary hover:underline"
        >
          Back to Custom Fields
        </Link>
      </div>
    );
  }

  return <FieldGroupBuilder group={group} fields={fields} />;
}
