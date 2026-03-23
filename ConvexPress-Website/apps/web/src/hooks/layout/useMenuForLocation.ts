import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { ResolvedMenu, ResolvedMenuItem } from "@/lib/layout/types";

/**
 * A menu item tree node as returned by the Convex getMenuForLocation query.
 * Matches the MenuItemTreeNode shape from the backend internals.
 */
interface ConvexMenuItemNode {
  _id: string;
  menuId: string;
  itemType: "page" | "post" | "category" | "tag" | "custom";
  objectId?: string;
  label: string;
  title?: string;
  description?: string;
  url?: string;
  parentItemId?: string;
  position: number;
  depth: number;
  target?: "_self" | "_blank";
  cssClasses?: string;
  linkRel?: string;
  isOrphaned?: boolean;
  children: ConvexMenuItemNode[];
}

/**
 * Fetch the menu assigned to a specific theme location.
 * Connects to the Convex `getMenuForLocation` public query.
 * Filters out orphaned items client-side as a safety net.
 */
export function useMenuForLocation(
  location: string,
): ResolvedMenu | undefined {
  const data = useQuery(api.menus.queries.getMenuForLocation, {
    locationSlug: location,
  });

  if (!data) {
    return undefined;
  }

  // Map Convex MenuItemTreeNode[] to ResolvedMenuItem[] recursively
  const mapItems = (items: ConvexMenuItemNode[]): ResolvedMenuItem[] => {
    return items
      .filter((item) => !item.isOrphaned)
      .map((item) => ({
        id: item._id,
        label: item.label,
        url: item.url ?? "#",
        target: item.target,
        rel: item.linkRel,
        cssClasses: item.cssClasses,
        type: item.itemType,
        depth: item.depth ?? 0,
        isOrphaned: item.isOrphaned,
        children: mapItems(item.children ?? []),
      }));
  };

  return {
    id: data.menu._id,
    name: data.menu.name,
    slug: data.menu.slug,
    items: mapItems(data.items),
  };
}
