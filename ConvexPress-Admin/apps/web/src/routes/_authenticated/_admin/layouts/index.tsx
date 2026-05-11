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
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Plus, LayoutGrid, Settings2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutCard } from "@/components/layouts/LayoutCard";
import type { Layout } from "@/components/layouts/types";
import { DeprecatedSystemBanner } from "@/components/appearance/DeprecatedSystemBanner";

export const Route = createFileRoute("/_authenticated/_admin/layouts/")({
  component: LayoutLibraryPage,
});

type FilterType = "all" | "preset" | "custom" | "ai";

const FILTER_OPTIONS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "preset", label: "Presets" },
  { id: "custom", label: "Custom" },
  { id: "ai", label: "AI Generated" },
];

function LayoutLibraryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>("all");

  const layouts = useQuery(api.layouts.queries.list);

  const filteredLayouts =
    layouts?.filter((layout: Layout) =>
      filter === "all" ? true : layout.type === filter
    ) ?? [];

  return (
    <div className="p-6 space-y-6">
      <DeprecatedSystemBanner />
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10">
            <LayoutGrid className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Layout Library
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage and customize how your content is displayed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/layouts/assign">
            <Button variant="outline">
              <Settings2 className="size-4" data-icon="inline-start" />
              Assign Defaults
            </Button>
          </Link>
          <Button onClick={() => navigate({ to: "/layouts/new" })}>
            <Plus className="size-4" data-icon="inline-start" />
            New Layout
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === option.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {layouts === undefined ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border overflow-hidden"
            >
              <Skeleton className="h-28 w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredLayouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutGrid className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-sm font-medium text-muted-foreground">
            {filter === "all"
              ? "No layouts yet"
              : `No ${filter} layouts found`}
          </h3>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create your first layout to get started
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/layouts/new" })}
            className="mt-4"
          >
            <Plus className="size-3.5" data-icon="inline-start" />
            Create Layout
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredLayouts.map((layout: Layout) => (
            <LayoutCard
              key={layout._id}
              layout={layout}
              onClick={() =>
                navigate({
                  to: "/layouts/$layoutId",
                  params: { layoutId: layout._id },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
