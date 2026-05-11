import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MenuTabBar } from "@/components/menus/MenuTabBar";
import { MenuCreateForm } from "@/components/menus/MenuCreateForm";
import { MenuListTable } from "@/components/menus/MenuListTable";

const menuSearchSchema = z.object({
  search: z.string().optional(),
  orderBy: z.enum(["name", "items", "date"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/menus/")({
  validateSearch: menuSearchSchema,
  component: MenusPage,
});

/**
 * All Menus page (/admin/menus).
 * Lists existing menus and provides a create form.
 * WordPress equivalent: Appearance > Menus.
 */
function MenusPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground mb-4">Menus</h1>

      <MenuTabBar />

      {/* Create Menu form */}
      <div className="mb-6">
        <MenuCreateForm />
      </div>

      {/* Menu list */}
      <MenuListTable />
    </div>
  );
}
