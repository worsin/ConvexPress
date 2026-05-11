import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { LoaderIcon } from "lucide-react";
import type { Id } from "@backend/convex/_generated/dataModel";

interface MenuLocationRow {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  menuId?: Id<"menus"> | null;
}

interface MenuOptionRow {
  _id: Id<"menus">;
  name: string;
}

/**
 * Location assignment table for the Manage Locations page.
 * Each row shows a location name, description, and a dropdown to assign a menu.
 */
export function MenuLocationTable() {
  const locations = useQuery(api.menus.queries.getMenuLocations) as
    | MenuLocationRow[]
    | undefined;
  const menus = useQuery(api.menus.queries.listMenus) as MenuOptionRow[] | undefined;
  const assignMenuToLocation = useMutation(
    api.menus.mutations.assignMenuToLocation,
  );

  // Local selection state for optimistic UI while autosave is in-flight.
  const [localAssignments, setLocalAssignments] = useState<
    Record<string, string>
  >({});
  const [rowStatus, setRowStatus] = useState<
    Record<string, "idle" | "pending" | "saving" | "saved" | "error">
  >({});
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Initialize local state from server state once loaded
  const getMenuIdForLocation = useCallback(
    (locationSlug: string, serverMenuId?: string | null) => {
      if (locationSlug in localAssignments) {
        return localAssignments[locationSlug];
      }
      return serverMenuId ?? "";
    },
    [localAssignments],
  );

  const handleChange = (locationSlug: string, menuId: string) => {
    setLocalAssignments((prev) => ({
      ...prev,
      [locationSlug]: menuId,
    }));

    const existingTimer = timersRef.current.get(locationSlug);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timersRef.current.delete(locationSlug);
    }

    setRowStatus((prev) => ({ ...prev, [locationSlug]: "pending" }));

    const timer = setTimeout(() => {
      timersRef.current.delete(locationSlug);
      setRowStatus((prev) => ({ ...prev, [locationSlug]: "saving" }));
      void assignMenuToLocation({
        locationSlug,
        menuId: menuId ? (menuId as Id<"menus">) : undefined,
      })
        .then(() => {
          setRowStatus((prev) => ({ ...prev, [locationSlug]: "saved" }));
          setLocalAssignments((prev) => {
            const next = { ...prev };
            delete next[locationSlug];
            return next;
          });
        })
        .catch((error) => {
          setRowStatus((prev) => ({ ...prev, [locationSlug]: "error" }));
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to save location assignment",
          );
        });
    }, 500);

    timersRef.current.set(locationSlug, timer);
  };

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  if (locations === undefined || menus === undefined) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="h-12 animate-pulse bg-muted/50 border border-border"
          />
        ))}
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        No menu locations registered. Locations are defined by the theme.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-48">
                Theme Location
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Description
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-60">
                Assigned Menu
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-36">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => {
              const selectedMenuId = getMenuIdForLocation(
                location.slug,
                location.menuId ? (location.menuId as string) : "",
              );
              const status = rowStatus[location.slug] ?? "idle";

              return (
                <tr
                  key={location._id}
                  className="border-b border-border"
                >
                  <td className="px-3 py-3 text-xs font-medium text-foreground">
                    {location.name}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {location.description ?? "--"}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={selectedMenuId}
                      onChange={(e) =>
                        handleChange(location.slug, e.target.value)
                      }
                      className="w-full h-8 rounded-none border border-input bg-transparent px-2 text-xs focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 outline-hidden"
                    >
                      <option value="">&mdash; No menu &mdash;</option>
                      {menus.map((menu) => (
                        <option key={menu._id} value={menu._id as string}>
                          {menu.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-[11px] text-muted-foreground">
                    {status === "pending" && "Saving shortly..."}
                    {status === "saving" && (
                      <span className="inline-flex items-center gap-1">
                        <LoaderIcon className="size-3 animate-spin" />
                        Saving...
                      </span>
                    )}
                    {status === "saved" && "Saved"}
                    {status === "error" && (
                      <span className="text-destructive">Save failed</span>
                    )}
                    {status === "idle" && "Saved"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
