import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { CopyIcon, EditIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MenuDeleteDialog } from "./MenuDeleteDialog";
import { useDuplicateMenu } from "@/hooks/menus";
import type { Id } from "@backend/convex/_generated/dataModel";

/**
 * Table listing all menus with name, item count, assigned locations, date, and actions.
 */
export function MenuListTable() {
  const menus = useQuery(api.menus.queries.listMenus);
  const duplicateMenu = useDuplicateMenu();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"menus">;
    name: string;
  } | null>(null);

  const handleDuplicate = async (menuId: Id<"menus">, menuName: string) => {
    try {
      await duplicateMenu({ menuId });
      toast.success(`Duplicated "${menuName}"`);
    } catch (err) {
      toast.error("Failed to duplicate menu");
    }
  };

  if (menus === undefined) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="h-10 animate-pulse bg-muted/50 border border-border"
          />
        ))}
      </div>
    );
  }

  if (menus.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        No menus yet. Create one above to get started.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto mt-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-20">
                Items
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-52">
                Locations
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-36">
                Date
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {menus.map((menu) => (
              <tr
                key={menu._id}
                className="group/row border-b border-border transition-colors hover:bg-muted/30"
              >
                {/* Name */}
                <td className="px-3 py-2.5">
                  <Link
                    to="/menus/$menuId/edit"
                    params={{ menuId: menu._id as string }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {menu.name}
                  </Link>
                  {menu.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-xs">
                      {menu.description}
                    </p>
                  )}
                </td>

                {/* Items */}
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {menu.itemCount ?? 0}
                </td>

                {/* Locations */}
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {menu.assignedLocations.length > 0
                    ? menu.assignedLocations.join(", ")
                    : "--"}
                </td>

                {/* Date */}
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {new Date(menu.createdAt).toLocaleDateString()}
                </td>

                {/* Actions */}
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      render={
                        <Link
                          to="/menus/$menuId/edit"
                          params={{ menuId: menu._id as string }}
                          aria-label={`Edit ${menu.name}`}
                        />
                      }
                    >
                      <EditIcon className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDuplicate(menu._id, menu.name)}
                      aria-label={`Duplicate ${menu.name}`}
                    >
                      <CopyIcon className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setDeleteTarget({ id: menu._id, name: menu.name })
                      }
                      aria-label={`Delete ${menu.name}`}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <MenuDeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          menuId={deleteTarget.id}
          menuName={deleteTarget.name}
        />
      )}
    </>
  );
}
