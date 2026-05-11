import { cn } from "@/lib/utils";
import type { ResolvedMenuItem } from "@/lib/layout/types";
import { MenuItem } from "./MenuItem";

interface MenuItemListProps {
  /** Array of resolved menu items (can be nested via children) */
  items: ResolvedMenuItem[];
  /** Current nesting depth (0 = top level) */
  depth?: number;
  /** Maximum depth to render. Items deeper than this are not shown. */
  maxDepth?: number;
  /** Additional CSS class for each item */
  itemClassName?: string;
  /** Whether to show item descriptions (mega-menu style) */
  showDescriptions?: boolean;
  /** Layout direction */
  direction?: "horizontal" | "vertical";
  /** Callback when any link is clicked */
  onNavigate?: () => void;
}

/**
 * Recursive menu item renderer for the website.
 * Renders a <ul> of items, recursing into children for nested menus.
 *
 * This is the website equivalent of WordPress's Walker_Nav_Menu.
 * Used by SiteMenu to render different variants (header, footer, sidebar).
 */
export function MenuItemList({
  items,
  depth = 0,
  maxDepth,
  itemClassName,
  showDescriptions = false,
  direction = "vertical",
  onNavigate,
}: MenuItemListProps) {
  if (maxDepth !== undefined && depth > maxDepth) return null;

  const visibleItems = items.filter((item) => !item.isOrphaned);

  if (visibleItems.length === 0) return null;

  return (
	    <ul
	      role="list"
	      data-show-descriptions={showDescriptions || undefined}
	      className={cn(
        direction === "horizontal"
          ? "flex items-center gap-1"
          : "space-y-0.5",
        depth > 0 && direction === "vertical" && "ml-4",
      )}
    >
      {visibleItems.map((item) => (
        <li key={item.id}>
          <MenuItem
            item={item}
            className={itemClassName}
            onClick={onNavigate}
          />
          {item.children.length > 0 && (
            <MenuItemList
              items={item.children}
              depth={depth + 1}
              maxDepth={maxDepth}
              itemClassName={itemClassName}
              showDescriptions={showDescriptions}
              direction={direction}
              onNavigate={onNavigate}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
