import { Link, useMatchRoute } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * Tab bar for navigating between "Edit Menus" and "Manage Locations".
 * Shared between the menus index and locations pages.
 */
export function MenuTabBar() {
  const matchRoute = useMatchRoute();
  const isMenusIndex = matchRoute({ to: "/menus", fuzzy: false });
  const isMenuEdit = matchRoute({
    to: "/menus/$menuId/edit",
    fuzzy: true,
  });
  const isLocations = matchRoute({
    to: "/menus/locations",
    fuzzy: false,
  });

  const isEditMenusActive = !!isMenusIndex || !!isMenuEdit;
  const isLocationsActive = !!isLocations;

  return (
    <div className="flex gap-4 border-b border-border mb-6">
      <Link
        to="/menus"
        className={cn(
          "pb-2 text-xs font-medium transition-colors border-b-2",
          isEditMenusActive
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        Edit Menus
      </Link>
      <Link
        to="/menus/locations"
        className={cn(
          "pb-2 text-xs font-medium transition-colors border-b-2",
          isLocationsActive
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        Manage Locations
      </Link>
    </div>
  );
}
