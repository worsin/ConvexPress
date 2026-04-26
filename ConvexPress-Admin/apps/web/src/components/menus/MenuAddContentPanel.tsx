import { useState, useMemo, useTransition } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  FileTextIcon,
  PenToolIcon,
  FolderIcon,
  TagIcon,
  LoaderIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { Id } from "@backend/convex/_generated/dataModel";

type ContentType = "page" | "post" | "category" | "tag";

interface LinkableContentItem {
  id: string;
  label: string;
  type: ContentType;
  url?: string;
  status?: string;
}

interface MenuAddContentPanelProps {
  menuId: Id<"menus">;
  contentType: ContentType;
}

const CONTENT_ICONS: Record<ContentType, typeof FileTextIcon> = {
  page: FileTextIcon,
  post: PenToolIcon,
  category: FolderIcon,
  tag: TagIcon,
};

const CONTENT_LABELS: Record<ContentType, string> = {
  page: "Pages",
  post: "Posts",
  category: "Categories",
  tag: "Tags",
};

/**
 * Reusable panel for adding pages, posts, categories, or tags to a menu.
 * Supports search filtering and multi-select with "Add to Menu" button.
 */
export function MenuAddContentPanel({
  menuId,
  contentType,
}: MenuAddContentPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, startAdding] = useTransition();
  const [tab, setTab] = useState<"recent" | "all" | "search">("recent");

  const addMenuItem = useMutation(api.menus.mutations.addMenuItem);

  const content = useQuery(api.menus.queries.getLinkableContent, {
    type: contentType,
    search: tab === "search" && search.trim() ? search.trim() : undefined,
    limit: tab === "recent" ? 10 : 100,
  }) as LinkableContentItem[] | undefined;

  const Icon = CONTENT_ICONS[contentType];
  const label = CONTENT_LABELS[contentType];

  // Filter by tab
  const items = useMemo(() => {
    if (!content) return [];
    return content;
  }, [content]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const handleAddToMenu = () => {
    if (selectedIds.size === 0) return;

    startAdding(async () => {
      try {
        const selected = items.filter((item) => selectedIds.has(item.id));
        for (const item of selected) {
          await addMenuItem({
            menuId,
            itemType: contentType,
            objectId: item.id,
            label: item.label,
            url: item.url,
          });
        }
        toast.success(
          `${selected.length} ${selected.length === 1 ? "item" : "items"} added to menu`,
        );
        setSelectedIds(new Set());
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "Failed to add items",
        );
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Icon className="size-3" />
        {label}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 text-[10px]">
        <button
          type="button"
          onClick={() => setTab("recent")}
          className={`px-2 py-0.5 transition-colors ${
            tab === "recent"
              ? "text-foreground font-medium border-b border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Most Recent
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`px-2 py-0.5 transition-colors ${
            tab === "all"
              ? "text-foreground font-medium border-b border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          View All
        </button>
        <button
          type="button"
          onClick={() => setTab("search")}
          className={`px-2 py-0.5 transition-colors ${
            tab === "search"
              ? "text-foreground font-medium border-b border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Search
        </button>
      </div>

      {/* Search input */}
      {tab === "search" && (
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="pl-7 h-7 text-[10px]"
          />
        </div>
      )}

      {/* Content list */}
      <div className="border border-border max-h-48 overflow-y-auto">
        {content === undefined ? (
          <div className="p-3 text-center">
            <LoaderIcon className="size-3 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="p-3 text-[10px] text-muted-foreground text-center">
            No {label.toLowerCase()} found.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center px-2 py-1.5">
                <label className="flex items-center gap-2 w-full cursor-pointer">
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  <span className="text-[10px] text-foreground truncate flex-1">
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {items.length > 0 && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={items.length > 0 && selectedIds.size === items.length}
              indeterminate={
                selectedIds.size > 0 && selectedIds.size < items.length
              }
              onCheckedChange={toggleAll}
            />
            <span className="text-[10px] text-muted-foreground">
              Select All
            </span>
          </label>
        )}
        <Button
          variant="outline"
          size="xs"
          onClick={handleAddToMenu}
          disabled={isAdding || selectedIds.size === 0}
        >
          {isAdding ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <PlusIcon className="size-3" />
          )}
          Add to Menu
        </Button>
      </div>
    </div>
  );
}
