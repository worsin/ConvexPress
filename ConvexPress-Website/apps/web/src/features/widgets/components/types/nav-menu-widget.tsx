/**
 * Navigation Menu Widget - Website Renderer
 *
 * Displays a navigation menu from the Menu System.
 * Uses the getMenuForLocation query with a "widget" location,
 * or falls back to getMenu for a specific menuId.
 *
 * Hooks are called unconditionally (React Rules of Hooks).
 * The "skip" pattern is used when no menuId is provided.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

interface NavMenuWidgetConfig {
  menuId?: string;
}


export function NavMenuWidget({
  config,
}: {
  config: NavMenuWidgetConfig;
}) {
  // Call useQuery unconditionally (React Rules of Hooks).
  // Pass "skip" when there is no menuId to avoid making a request.
  const menuData = useQuery(
    api.menus.queries.getMenu,
    config.menuId
      ? { menuId: config.menuId as Id<"menus"> }
      : "skip",
  );

  if (!config.menuId) {
    return (
      <p className="text-sm text-muted-foreground">No menu selected.</p>
    );
  }

  // Loading state: menuData is undefined while the query is in flight
  if (menuData === undefined) {
    return (
      <nav className="animate-pulse space-y-1">
        <div className="h-4 w-20 bg-muted/50 rounded" />
        <div className="h-4 w-24 bg-muted/50 rounded" />
        <div className="h-4 w-16 bg-muted/50 rounded" />
      </nav>
    );
  }

  // Menu not found (query returned null)
  if (menuData === null) {
    return (
      <p className="text-sm text-muted-foreground">Menu not found.</p>
    );
  }

  // Filter out orphaned items
  const activeItems = menuData.items.filter(
    (item: NonNullable<typeof menuData>["items"][number]) => item.isOrphaned !== true,
  );

  if (activeItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Menu is empty.</p>
    );
  }

  return (
    <nav aria-label={menuData.name}>
      <ul className="space-y-1">
        {activeItems.map((item: typeof activeItems[number]) => (
          <li key={item._id}>
            <a
              href={item.url || "#"}
              target={item.target || "_self"}
              className="text-sm hover:underline block py-0.5"
            >
              {item.label || "Untitled"}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
