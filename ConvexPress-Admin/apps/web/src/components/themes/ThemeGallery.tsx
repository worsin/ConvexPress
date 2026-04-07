import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import {
  Loader2,
  Palette,
  PanelTop,
  PanelBottom,
  Layout,
  ArrowRight,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ThemeCard } from "./ThemeCard";
import type { Theme } from "./types";

// ─── Filter Types ───────────────────────────────────────────────────────────

type FilterType = "all" | "preset" | "custom";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "preset", label: "Presets" },
  { value: "custom", label: "Custom" },
];

// ─── Customize Links ────────────────────────────────────────────────────────

const CUSTOMIZE_LINKS = [
  {
    label: "Header",
    description: "Customize header layout and navigation",
    to: "/appearance/header" as const,
    icon: PanelTop,
  },
  {
    label: "Footer",
    description: "Edit footer columns and content",
    to: "/appearance/footer" as const,
    icon: PanelBottom,
  },
  {
    label: "Layouts",
    description: "Assign layouts to content types",
    to: "/layouts/assign" as const,
    icon: Layout,
  },
  {
    label: "Colors",
    description: "Adjust the color palette",
    to: "/appearance/colors" as const,
    icon: Palette,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ThemeGallery() {
  const themes = useQuery(api.themes.queries.list);
  const activateMutation = useMutation(api.themes.mutations.activate);
  const duplicateMutation = useMutation(api.themes.mutations.duplicate);
  const removeMutation = useMutation(api.themes.mutations.remove);

  const [filter, setFilter] = useState<FilterType>("all");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleActivate = useCallback(
    async (id: string) => {
      try {
        await activateMutation({ id: id as any });
        toast.success(
          "Theme activated! Your site's appearance has been updated.",
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to activate theme";
        toast.error(message);
      }
    },
    [activateMutation],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        await duplicateMutation({ id: id as any });
        toast.success("Theme duplicated");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to duplicate theme";
        toast.error(message);
      }
    },
    [duplicateMutation],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removeMutation({ id: deleteTarget as any });
      toast.success("Theme deleted");
      setDeleteTarget(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete theme";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, removeMutation]);

  // ─── Derived Data ─────────────────────────────────────────────────────────

  const activeTheme = themes?.find((t: Theme) => t.isActive === true) as
    | Theme
    | undefined;

  const filteredThemes = (themes as Theme[] | undefined)?.filter((t) => {
    if (filter === "all") return true;
    return t.type === filter;
  });

  // ─── Loading State ────────────────────────────────────────────────────────

  if (themes === undefined) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Themes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a theme to set your site's overall look — header, footer,
            layouts, and colors.
          </p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Themes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a theme to set your site's overall look — header, footer,
          layouts, and colors.
        </p>
      </div>

      {/* Active theme highlight */}
      {activeTheme && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Check className="size-4 text-green-500" />
            Active Theme: {activeTheme.name}
          </div>
          {activeTheme.description && (
            <p className="mt-1 text-xs text-muted-foreground">
              {activeTheme.description}
            </p>
          )}

          {/* Quick customize links */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CUSTOMIZE_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="group/link flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-muted/50"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <link.icon className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {link.label}
                  </span>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {link.description}
                  </p>
                </div>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover/link:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Filter chips + gallery */}
      <div className="flex flex-col gap-5">
        {/* Filters */}
        <div className="flex items-center gap-2">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(option.value)}
              className={cn(
                filter === option.value
                  ? ""
                  : "text-muted-foreground",
              )}
            >
              {option.label}
            </Button>
          ))}

          {filteredThemes && (
            <span className="ml-2 text-xs text-muted-foreground">
              {filteredThemes.length}{" "}
              {filteredThemes.length === 1 ? "theme" : "themes"}
            </span>
          )}
        </div>

        {/* Theme grid */}
        {filteredThemes && filteredThemes.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredThemes.map((theme) => (
              <ThemeCard
                key={theme._id}
                theme={theme}
                onActivate={handleActivate}
                onDuplicate={handleDuplicate}
                onDelete={(id) => setDeleteTarget(id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
            <p className="text-sm text-muted-foreground">
              {filter === "all"
                ? "No themes found. Create your first theme to get started."
                : `No ${filter} themes found.`}
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete theme?"
        message="This theme will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        isExecuting={isDeleting}
      />
    </div>
  );
}
