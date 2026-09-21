/** Public header menus need menu data, not the dashboard page/widget registry. */
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { menuToNav, type MenuTreeNode, type NavItem } from "../nav";

interface MenuPayload {
  menu: { _id: string; name: string; slug: string };
  items: MenuTreeNode[];
}

export interface DashboardMenuResult {
  /** undefined while loading; null when no menu is assigned; else the nav. */
  nav: NavItem[] | null | undefined;
  isLoading: boolean;
}

export function useDashboardMenu(location: string, basePath: string, enabled: boolean = true): DashboardMenuResult {
  const slug = location.trim();
  const data = useQuery(
    api.menus.queries.getMenuForLocation,
    enabled && slug ? { locationSlug: slug } : "skip",
  ) as MenuPayload | null | undefined;
  return useMemo(() => {
    if (!enabled || !slug) return { nav: null, isLoading: false };
    if (data === undefined) return { nav: undefined, isLoading: true };
    if (data === null) return { nav: null, isLoading: false };
    const nav = menuToNav(data.items, basePath);
    return { nav: nav.length ? nav : null, isLoading: false };
  }, [basePath, data, enabled, slug]);
}
