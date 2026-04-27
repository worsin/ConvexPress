/**
 * Tags Management Page - WordPress-style split-panel
 *
 * Left: AddTagForm. Right: TermListTable for tags.
 * Page header "Tags" with total count.
 * Popular Tags section below the add form.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { z } from "zod";

import { api } from "@backend/convex/_generated/api";
import { AddTagForm } from "@/components/taxonomy/AddTagForm";
import { PopularTags } from "@/components/taxonomy/PopularTags";
import { TermListTable } from "@/components/taxonomy/TermListTable";

const tagSearchSchema = z.object({
  search: z.string().optional(),
  orderBy: z.enum(["name", "description", "slug", "count"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/posts/tags")({
  validateSearch: tagSearchSchema,
  component: TagsPage,
});

function TagsPage() {
  const { search, orderBy, orderDir, page, perPage } = Route.useSearch();
  const counts = useQuery(api.taxonomies.queries.counts);
  const tagCount = counts?.tags ?? 0;

  // Fetch the tags list -- reactive, updates live
  const data = useQuery(api.taxonomies.queries.list, {
    taxonomy: "post_tag" as const,
    search: search || undefined,
    orderBy: orderBy === "description" ? "name" : orderBy, // description not a backend sort field
    orderDir,
    page,
    perPage,
  });

  // Fetch popular tags for the tag cloud
  const popularResult = useQuery(api.taxonomies.queries.list, {
    taxonomy: "post_tag" as const,
    orderBy: "count" as const,
    orderDir: "desc" as const,
    perPage: 20,
    hideEmpty: true,
  });

  const popularTags = (popularResult?.terms ?? []).map(
    (t: { _id: string; name: string; slug: string; count: number }) => ({
      _id: t._id,
      name: t.name,
      slug: t.slug,
      count: t.count,
    }),
  );

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Tags</h1>
        {counts !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">
            {tagCount} {tagCount === 1 ? "tag" : "tags"} total
          </p>
        )}
      </div>

      {/* Split Panel Layout */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Panel - Add New Tag Form + Popular Tags */}
        <div className="lg:w-[320px] shrink-0 space-y-6">
          <AddTagForm />

          {/* Popular Tags Cloud */}
          {popularTags.length > 0 && (
            <PopularTags tags={popularTags} />
          )}
        </div>

        {/* Right Panel - Tag List Table */}
        <div className="flex-1 min-w-0">
          <TermListTable taxonomy="post_tag" data={data} />
        </div>
      </div>
    </div>
  );
}
