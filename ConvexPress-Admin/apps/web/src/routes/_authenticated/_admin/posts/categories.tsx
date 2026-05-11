/**
 * Categories Management Page - WordPress-style split-panel
 *
 * Left: AddCategoryForm. Right: TermListTable for categories.
 * Page header "Categories" with total count.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { z } from "zod";

import { api } from "@backend/convex/_generated/api";
import { AddCategoryForm } from "@/components/taxonomy/AddCategoryForm";
import { TermListTable } from "@/components/taxonomy/TermListTable";

const categorySearchSchema = z.object({
  search: z.string().optional(),
  orderBy: z.enum(["name", "description", "slug", "count"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/posts/categories",
)({
  validateSearch: categorySearchSchema,
  component: CategoriesPage,
});

function CategoriesPage() {
  const { search, orderBy, orderDir, page, perPage } = Route.useSearch();
  const counts = useQuery(api.taxonomies.queries.counts);
  const categoryCount = counts?.categories ?? 0;

  // Fetch the categories list -- reactive, updates live
  const data = useQuery(api.taxonomies.queries.list, {
    taxonomy: "category" as const,
    search: search || undefined,
    orderBy: orderBy === "description" ? "name" : orderBy, // description not a backend sort field
    orderDir,
    page,
    perPage,
  });

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Categories</h1>
        {counts !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">
            {categoryCount} {categoryCount === 1 ? "category" : "categories"}{" "}
            total
          </p>
        )}
      </div>

      {/* Split Panel Layout */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Panel - Add New Category Form */}
        <div className="lg:w-[320px] shrink-0">
          <AddCategoryForm />
        </div>

        {/* Right Panel - Category List Table */}
        <div className="flex-1 min-w-0">
          <TermListTable taxonomy="category" data={data} />
        </div>
      </div>
    </div>
  );
}
