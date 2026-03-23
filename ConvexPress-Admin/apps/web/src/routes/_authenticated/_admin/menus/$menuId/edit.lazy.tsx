/**
 * Edit Menu - Lazy-loaded component
 *
 * Full menu builder with drag-and-drop reordering, add items sidebar, and settings.
 */

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { LoaderIcon } from "lucide-react";

import { MenuTabBar } from "@/components/menus/MenuTabBar";
import { MenuBuilder } from "@/components/menus/MenuBuilder";
import type { Id } from "@backend/convex/_generated/dataModel";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/menus/$menuId/edit",
)({
  component: MenuEditPage,
});

function MenuEditPage() {
  const { menuId } = Route.useParams();
  const navigate = useNavigate();

  const menu = useQuery(api.menus.queries.getMenu, {
    menuId: menuId as Id<"menus">,
  });

  // Loading state
  if (menu === undefined) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-4">
          Edit Menu
        </h1>
        <MenuTabBar />
        <div className="flex items-center justify-center py-12">
          <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Menu not found
  if (menu === null) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-4">
          Edit Menu
        </h1>
        <MenuTabBar />
        <div className="border border-border p-8 text-center">
          <p className="text-xs text-muted-foreground mb-3">
            Menu not found. It may have been deleted.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/menus" })}
            className="text-xs text-primary hover:underline"
          >
            Back to Menus
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground mb-4">
        Edit Menu: {menu.name}
      </h1>
      <MenuTabBar />
      <MenuBuilder menu={menu} />
    </div>
  );
}
