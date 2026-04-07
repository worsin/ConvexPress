import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@cvx/api";
import {
  FileText,
  File,
  BookOpen,
  FolderOpen,
  Tag,
  User,
  Search,
  Library,
  Save,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { Layout } from "@/components/layouts/types";

export const Route = createFileRoute(
  "/_authenticated/_admin/layouts/assign"
)({
  component: LayoutAssignmentsPage,
});

interface ContentTypeConfig {
  id: string;
  label: string;
  description: string;
  icon: typeof FileText;
  settingKey: string;
}

const CONTENT_TYPES: ContentTypeConfig[] = [
  {
    id: "blog-posts",
    label: "Blog Posts",
    description: "Default layout for individual blog post pages",
    icon: FileText,
    settingKey: "layout_blog_posts",
  },
  {
    id: "pages",
    label: "Pages",
    description: "Default layout for static pages",
    icon: File,
    settingKey: "layout_pages",
  },
  {
    id: "blog-index",
    label: "Blog Index",
    description: "Layout for the main blog listing page",
    icon: BookOpen,
    settingKey: "layout_blog_index",
  },
  {
    id: "category-archives",
    label: "Category Archives",
    description: "Layout for category archive pages",
    icon: FolderOpen,
    settingKey: "layout_category_archives",
  },
  {
    id: "tag-archives",
    label: "Tag Archives",
    description: "Layout for tag archive pages",
    icon: Tag,
    settingKey: "layout_tag_archives",
  },
  {
    id: "author-archives",
    label: "Author Archives",
    description: "Layout for author archive pages",
    icon: User,
    settingKey: "layout_author_archives",
  },
  {
    id: "search-results",
    label: "Search Results",
    description: "Layout for search results pages",
    icon: Search,
    settingKey: "layout_search_results",
  },
  {
    id: "knowledge-base",
    label: "Knowledge Base",
    description: "Default layout for knowledge base articles",
    icon: Library,
    settingKey: "layout_knowledge_base",
  },
];

function LayoutAssignmentsPage() {
  const layouts = useQuery(api.layouts.queries.list);
  const currentSettings = useQuery(api.settings.queries.getBySection, {
    section: "layout",
  });
  const updateSettings = useMutation(api.settings.mutations.updateSection);

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize assignments from current settings
  useEffect(() => {
    if (currentSettings && typeof currentSettings === "object") {
      const initial: Record<string, string> = {};
      for (const ct of CONTENT_TYPES) {
        const settingValue = (currentSettings as Record<string, unknown>)[
          ct.settingKey
        ];
        if (typeof settingValue === "string") {
          initial[ct.settingKey] = settingValue;
        }
      }
      setAssignments(initial);
    }
  }, [currentSettings]);

  const handleChange = (settingKey: string, layoutId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (layoutId) {
        next[settingKey] = layoutId;
      } else {
        delete next[settingKey];
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        section: "layout",
        settings: assignments,
      });
      toast.success("Layout assignments saved");
      setHasChanges(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save layout assignments"
      );
    } finally {
      setSaving(false);
    }
  };

  const isLoading = layouts === undefined || currentSettings === undefined;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Default Layouts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Assign a default layout for each content type. Individual posts and
          pages can override these defaults.
        </p>
      </div>

      {/* Content type cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border p-4 space-y-3"
            >
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CONTENT_TYPES.map((ct) => {
            const Icon = ct.icon;
            return (
              <div
                key={ct.id}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center size-8 rounded-lg bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-foreground">
                      {ct.label}
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {ct.description}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1">
                    Layout
                  </Label>
                  <select
                    value={assignments[ct.settingKey] || ""}
                    onChange={(e) =>
                      handleChange(ct.settingKey, e.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
                  >
                    <option value="">None (use system default)</option>
                    {(layouts as Layout[])?.map((layout) => (
                      <option key={layout._id} value={layout._id}>
                        {layout.name}
                        {layout.type !== "custom"
                          ? ` (${layout.type})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-page override info */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border border-border/50 bg-primary/5 p-4"
        )}
      >
        <Info className="size-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Per-Page Overrides
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            These are default assignments. When editing individual posts or
            pages, you can override the layout in the editor&apos;s sidebar
            settings. Per-page overrides take priority over the defaults set
            here.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          <Save className="size-4" data-icon="inline-start" />
          {saving ? "Saving..." : "Save Assignments"}
        </Button>
      </div>
    </div>
  );
}
