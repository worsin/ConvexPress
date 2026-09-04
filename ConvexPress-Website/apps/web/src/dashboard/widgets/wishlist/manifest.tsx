/**
 * Wishlist: saved lists and their item counts (commerceWishlists.queries.getMyWishlists).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Heart } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { ViewAllLink, rowsForSize } from "../_shared";

interface WishlistRow {
  _id: string;
  name: string;
  isPublic: boolean;
  itemCount: number;
}

function WishlistWidget({ size }: DashboardWidgetProps) {
  const { to } = useDashboardShell();
  const settings = useSettings();
  const enabled = settings?.plugins?.commerceEnabled === true && settings?.plugins?.commerceWishlistsEnabled === true;
  const lists = useQuery(api.commerceWishlists.queries.getMyWishlists, enabled ? {} : "skip") as WishlistRow[] | undefined;
  if (!enabled) return <WidgetEmpty icon="heart" title="Wishlists are off" />;
  if (lists === undefined) return <WidgetSkeleton rows={3} />;
  const total = lists.reduce((acc, list) => acc + list.itemCount, 0);
  if (lists.length === 0 || total === 0) {
    return (
      <WidgetEmpty
        icon="heart"
        title="Nothing saved yet"
        description="Tap the heart on a product to save it for later."
        action={
          <Link to="/shop" className="font-medium text-primary hover:underline">
            Browse the shop
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        <span className="text-sm font-semibold text-foreground">{total}</span> saved item{total === 1 ? "" : "s"}
      </p>
      <ul role="list" className="divide-y divide-border">
        {lists.slice(0, rowsForSize(size, 4)).map((list) => (
          <li key={list._id}>
            <Link
              to={to("/wishlist")}
              className="flex items-center gap-2 py-1.5 text-xs transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Heart className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-foreground">{list.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {list.itemCount} item{list.itemCount === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/wishlist")} />;
}

const module: DashboardWidgetModule = {
  id: "wishlist",
  Widget: WishlistWidget,
  Actions,
};

export default module;
