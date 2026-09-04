import { useState } from "react";
import {
  ChevronDownIcon,
  Eye,
  FileTextIcon,
  FolderIcon,
  GripVerticalIcon,
  Heading as HeadingIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  LayoutPanelLeft,
  LinkIcon,
  Minus,
  PenToolIcon,
  TagIcon,
} from "lucide-react";

import { getDashboardPage } from "@backend/convex/extensions/dashboard/registry";
import { LucideDynamicIcon } from "@/components/icons/LucideDynamicIcon";
import { badgeSourceLabel, hasVisibilityRules, MENU_ITEM_TYPE_LABELS, visibilitySummary } from "@/lib/menus/item-editor-model";
import { cn } from "@/lib/utils";
import { MenuItemEditor } from "./MenuItemEditor";
import { MenuOrphanedBadge } from "./MenuOrphanedBadge";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { MenuItem, MenuItemType } from "./types";

const TYPE_ICONS: Record<MenuItemType, typeof FileTextIcon> = {
  page: FileTextIcon,
  post: PenToolIcon,
  category: FolderIcon,
  tag: TagIcon,
  custom: LinkIcon,
  dashboard: LayoutPanelLeft,
  heading: HeadingIcon,
  separator: Minus,
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
 * Collapsed: drag handle, icon, label, badge chip, visibility eye, type chip, expand arrow.
 * Headings render as section labels; separators as a rule. Both stay draggable and editable.
 */
export function MenuItemCard({ item, onRemove, onIndent, onOutdent, canIndent, canOutdent, dragHandleProps, isDragging }: MenuItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const TypeIcon = TYPE_ICONS[item.itemType] ?? LinkIcon;
  const typeLabel = MENU_ITEM_TYPE_LABELS[item.itemType] ?? "Link";
  const depth = item.depth ?? 0;
  const isHeading = item.itemType === "heading";
  const isSeparator = item.itemType === "separator";
  const registryPage = item.itemType === "dashboard" ? getDashboardPage(item.objectId ?? "") : undefined;
  const icon = item.icon || registryPage?.icon;
  const badge = item.badge || registryPage?.badge;
  const rules = hasVisibilityRules(item);

  return (
    <div
      className={cn(
        "border bg-card transition-colors",
        item.isOrphaned ? "border-warning/40 bg-warning/5" : "border-border",
        isHeading && "border-dashed bg-surface-2/60",
        isSeparator && "border-dashed bg-transparent",
        isDragging && "opacity-50 shadow-lg",
      )}
      style={{ marginLeft: `${depth * 24}px` }}
      data-item-type={item.itemType}
    >
      <div className={cn("flex items-center gap-2 px-3", isSeparator ? "py-1.5" : "py-2")}>
        <button
          type="button"
          className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...dragHandleProps}
        >
          <GripVerticalIcon className="size-3.5" />
        </button>

        {/* Item icon (dashboard-style menus) */}
        {!isSeparator && icon && (
          <LucideDynamicIcon name={icon} className="size-3.5 shrink-0 text-ink-2" />
        )}

        {/* Label */}
        {isSeparator ? (
          <span className="flex flex-1 items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
            Separator
            <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
          </span>
        ) : isHeading ? (
          <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">{item.label}</span>
        ) : (
          <span className="flex-1 truncate text-xs font-medium text-foreground">{item.label}</span>
        )}

        {item.isOrphaned && <MenuOrphanedBadge />}

        {/* Badge chip */}
        {badge && !isSeparator && (
          <span
            title={`Badge: ${badgeSourceLabel(badge)}`}
            className="inline-flex h-4 shrink-0 items-center gap-1 rounded-full bg-primary-soft px-1.5 text-[10px] font-medium text-primary"
          >
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {badgeSourceLabel(badge)}
          </span>
        )}

        {/* Visibility indicator */}
        {rules && (
          <span title={visibilitySummary(item)} aria-label={`Visibility rules: ${visibilitySummary(item)}`} className="inline-flex shrink-0 text-warning">
            <Eye className="size-3.5" />
          </span>
        )}

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

        {/* Type chip */}
        <span className="inline-flex shrink-0 items-center gap-1 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <TypeIcon className="size-2.5" />
          {typeLabel}
        </span>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <ChevronDownIcon className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")} />
        </button>
      </div>

      {isExpanded && <MenuItemEditor item={item} onClose={() => setIsExpanded(false)} onRemove={onRemove} />}
    </div>
  );
}
