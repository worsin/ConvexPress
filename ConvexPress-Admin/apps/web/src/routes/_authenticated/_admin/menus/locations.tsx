import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

import { MenuTabBar } from "@/components/menus/MenuTabBar";
import { MenuLocationTable } from "@/components/menus/MenuLocationTable";

export const Route = createFileRoute(
  "/_authenticated/_admin/menus/locations",
)({
  component: MenuLocationsPage,
});

/**
 * Menu Locations page (/admin/menus/locations).
 * Manage which menu is assigned to each theme location.
 * WordPress equivalent: Appearance > Menus > Manage Locations tab.
 */
function MenuLocationsPage() {
  const locations = useQuery(api.menus.queries.getMenuLocations);
  const locationCount = locations?.length ?? 0;

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground mb-4">
        Menu Locations
      </h1>

      <MenuTabBar />

      <p className="text-xs text-muted-foreground mb-4">
        Your theme supports {locationCount} menu{locationCount !== 1 ? "s" : ""}.
        Select which menu appears in each location.
      </p>

      <MenuLocationTable />
    </div>
  );
}
