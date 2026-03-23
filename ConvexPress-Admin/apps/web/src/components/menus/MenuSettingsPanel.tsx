import { useTransition } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import type { Id } from "@backend/convex/_generated/dataModel";

interface MenuSettingsPanelProps {
  menuId: Id<"menus">;
  autoAddPages: boolean;
  menuName: string;
}

/**
 * Menu settings panel shown below the item list in the editor.
 * Contains: auto-add pages checkbox and location assignment checkboxes.
 *
 * autoAddPages is driven directly from props (Convex reactive subscription),
 * eliminating the need for local state + sync-from-props useEffect.
 */
export function MenuSettingsPanel({
  menuId,
  autoAddPages,
  menuName,
}: MenuSettingsPanelProps) {
  const locations = useQuery(api.menus.queries.getMenuLocations);
  const updateMenu = useMutation(api.menus.mutations.updateMenu);
  const assignMenuToLocation = useMutation(
    api.menus.mutations.assignMenuToLocation,
  );

  const [isUpdatingAutoAdd, startAutoAddTransition] = useTransition();
  const [isTogglingLocation, startLocationTransition] = useTransition();

  const handleAutoAddChange = (checked: boolean) => {
    startAutoAddTransition(async () => {
      try {
        await updateMenu({ menuId, autoAddPages: checked });
      } catch (error: unknown) {
        toast.error("Failed to update auto-add setting");
      }
    });
  };

  const handleLocationToggle = (
    locationSlug: string,
    currentlyAssigned: boolean,
  ) => {
    startLocationTransition(async () => {
      try {
        await assignMenuToLocation({
          locationSlug,
          menuId: currentlyAssigned ? undefined : menuId,
        });
      } catch (error: unknown) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update location",
        );
      }
    });
  };

  return (
    <div className="border border-border bg-card p-4 mt-4 space-y-4">
      <h4 className="text-xs font-semibold text-foreground">Menu Settings</h4>

      {/* Auto-add pages */}
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={autoAddPages}
          onCheckedChange={(checked) =>
            handleAutoAddChange(checked === true)
          }
          disabled={isUpdatingAutoAdd}
          className="mt-0.5"
        />
        <span className="text-[10px] text-foreground leading-relaxed">
          Automatically add new top-level pages to this menu
        </span>
      </label>

      {/* Location checkboxes */}
      {locations && locations.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Display location
          </p>
          {locations.map((location) => {
            const isAssignedToThisMenu =
              location.menuId &&
              (location.menuId as string) === (menuId as string);
            const isAssignedToOther =
              location.menuId && !isAssignedToThisMenu;

            return (
              <label
                key={location._id}
                className="flex items-start gap-2 cursor-pointer"
              >
                <Checkbox
                  checked={!!isAssignedToThisMenu}
                  onCheckedChange={() =>
                    handleLocationToggle(
                      location.slug,
                      !!isAssignedToThisMenu,
                    )
                  }
                  className="mt-0.5"
                />
                <span className="text-[10px] text-foreground">
                  {location.name}
                  {isAssignedToOther && location.menuName && (
                    <span className="text-muted-foreground ml-1">
                      (Current: {location.menuName})
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
