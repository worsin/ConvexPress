import { useState } from "react";
import {
  ChevronDownIcon,
  GripVerticalIcon,
  FileTextIcon,
  PenToolIcon,
  FolderIcon,
  TagIcon,
  LinkIcon,
  IndentIncreaseIcon,
  IndentDecreaseIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { MenuItemEditor } from "./MenuItemEditor";
import { MenuOrphanedBadge } from "./MenuOrphanedBadge";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { MenuItem } from "./types";

const TYPE_ICONS: Record<string, typeof FileTextIcon> = {
  page: FileTextIcon,
  post: PenToolIcon,
  category: FolderIcon,
  tag: TagIcon,
  custom: LinkIcon,
};

const TYPE_LABELS: Record<string, string> = {
  page: "Page",
  post: "Post",
  category: "Category",
  tag: "Tag",
  custom: "Custom Link",
};

interface MenuItemCardProps {
  item: MenuItem;
  onRemove: (itemId: Id<"menuItems">) => void;
  onIndent?: (itemId: Id<"menuItems">) => void;
  onOutdent?: (itemId: Id<"menuItems">) => void;
  canIndent?: boolean;
  canOutdent?: boolean;
  /** Drag handle props from @dnd-kit */
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}

/**
 * Individual menu item card, showing collapsed and expanded states.
 * Collapsed: drag handle, label, type badge, expand arrow.
 * Expanded: full edit form via MenuItemEditor.
 */
export function MenuItemCard({
  item,
  onRemove,
  onIndent,
  onOutdent,
  canIndent,
  canOutdent,
  dragHandleProps,
  isDragging,
}: MenuItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const TypeIcon = TYPE_ICONS[item.itemType] ?? LinkIcon;
  const typeLabel = TYPE_LABELS[item.itemType] ?? "Link";
  const depth = item.depth ?? 0;

  return (
    <div
      className={cn(
        "border bg-card transition-colors",
        item.isOrphaned
          ? "border-warning/40 bg-warning/5"
          : "border-border",
        isDragging && "opacity-50 shadow-lg",
      )}
      style={{ marginLeft: `${depth * 24}px` }}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Drag handle */}
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Drag to reorder"
          {...dragHandleProps}
        >
          <GripVerticalIcon className="size-3.5" />
        </button>

        {/* Label */}
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          {item.label}
        </span>

        {/* Orphaned badge */}
        {item.isOrphaned && <MenuOrphanedBadge />}

        <button
          type="button"
          onClick={() => onOutdent?.(item._id)}
          disabled={!canOutdent}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Move item out one level"
        >
          <IndentDecreaseIcon className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onIndent?.(item._id)}
          disabled={!canIndent}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Nest item under previous item"
        >
          <IndentIncreaseIcon className="size-3.5" />
        </button>

        {/* Type badge */}
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 shrink-0">
          <TypeIcon className="size-2.5" />
          {typeLabel}
        </span>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <MenuItemEditor
          item={item}
          onClose={() => setIsExpanded(false)}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}
