/**
 * CategoriesMetabox - Post editor categories metabox
 *
 * Tab bar: "All Categories" (full tree) / "Most Used" (top 10 flat list).
 * Checkbox tree from CategoryTree component. "+ Add New Category" toggle:
 * name input + parent dropdown + Add button. Auto-checks newly created category.
 *
 * This is the taxonomy/CategoriesMetabox -- the standalone version using
 * real Convex queries. The editor/CategoriesMetabox wrapper delegates to this.
 */

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CategoryTree } from "./CategoryTree";
import { ParentCategorySelect } from "./ParentCategorySelect";

interface CategorySummary {
  _id: string;
  name: string;
  count?: number;
}

interface TaxonomyListResult {
  terms?: CategorySummary[];
}

interface CategoriesMetaboxProps {
  /** Set of selected category IDs. */
  selectedIds: Set<string>;
  /** Toggle a category ID on/off. */
  onToggle: (categoryId: string) => void;
}

export function CategoriesMetabox({
  selectedIds,
  onToggle,
}: CategoriesMetaboxProps) {
  const [activeTab, setActiveTab] = useState<"all" | "most-used">("all");
  const [showAddNew, setShowAddNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const categoryTree = useQuery(api.taxonomies.queries.getCategoryTree);
  const mostUsedResult = useQuery(api.taxonomies.queries.list, {
    taxonomy: "category" as const,
    orderBy: "count" as const,
    orderDir: "desc" as const,
    perPage: 10,
  }) as TaxonomyListResult | undefined;

  const createCategory = useMutation(
    api.taxonomies.mutations.createCategory,
  );

  const mostUsed = useMemo(
    () => mostUsedResult?.terms ?? [],
    [mostUsedResult],
  );

  const handleAddCategory = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    setIsCreating(true);
    try {
      const newId = await createCategory({
        name: trimmed,
        parentId: newCategoryParent || undefined,
      });
      // Auto-check the newly created category
      onToggle(newId as string);
      toast.success(`Category "${trimmed}" created.`);
      setNewCategoryName("");
      setNewCategoryParent("");
      setShowAddNew(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create category.";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [newCategoryName, newCategoryParent, createCategory, onToggle]);

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-border mb-2">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={cn(
            "px-2 py-1 text-xs",
            activeTab === "all"
              ? "text-foreground border-b-2 border-primary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          All Categories
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("most-used")}
          className={cn(
            "px-2 py-1 text-xs",
            activeTab === "most-used"
              ? "text-foreground border-b-2 border-primary font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Most Used
        </button>
      </div>

      {/* Category list */}
      <div className="max-h-[300px] overflow-y-auto">
        {activeTab === "all" ? (
          categoryTree ? (
            <CategoryTree
              nodes={categoryTree}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />
          ) : (
            <p className="text-xs text-muted-foreground py-2">Loading...</p>
          )
        ) : (
          mostUsed.map((cat) => (
            <div
              key={cat._id}
              className="flex items-center gap-1.5 py-0.5"
            >
              <Checkbox
                checked={selectedIds.has(cat._id)}
                onCheckedChange={() => onToggle(cat._id)}
                aria-label={cat.name}
              />
              <Label className="cursor-pointer text-xs font-normal">
                {cat.name}
              </Label>
            </div>
          ))
        )}
      </div>

      {/* Add New Category */}
      <div className="mt-2 pt-2 border-t border-border">
        {!showAddNew ? (
          <button
            type="button"
            onClick={() => setShowAddNew(true)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus className="size-3" />
            Add New Category
          </button>
        ) : (
          <div className="space-y-1.5">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              className="h-6 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCategory();
                }
              }}
              autoFocus
            />
            <ParentCategorySelect
              value={newCategoryParent}
              onChange={setNewCategoryParent}
              categoryTree={categoryTree}
              className="h-6 rounded-none border border-border bg-transparent px-1.5 text-xs w-full"
              ariaLabel="Parent category"
            />
            <div className="flex gap-1">
              <Button
                size="xs"
                onClick={handleAddCategory}
                disabled={isCreating}
              >
                {isCreating ? "Adding..." : "Add New Category"}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setShowAddNew(false);
                  setNewCategoryName("");
                  setNewCategoryParent("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
