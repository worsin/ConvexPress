/**
 * Desktop sidebar: brand row, navigation, collapse toggle, member card.
 * Width comes from `dashboardConfig.sidebarWidth`; collapsed is icon-only.
 */

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { AvatarDisplay } from "@/components/dashboard/profile/AvatarDisplay";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { NavItemLink } from "./NavItemLink";
import { useDashboardShell } from "./DashboardShellContext";

interface SidebarNavProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function SidebarNav({ collapsed, onToggle }: SidebarNavProps) {
  const { config, sidebarNav, badges, to } = useDashboardShell();
  const { user } = useCurrentUser();

  return (
    <aside
      data-slot="dashboard-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-(--dashboard-sidebar-width)",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-sidebar-border", collapsed ? "justify-center px-0" : "gap-2 px-4")}>
        <BrandMark config={config} href={to("")} compact={collapsed} className="min-w-0 flex-1" />
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            aria-expanded="true"
            className="flex size-8 shrink-0 items-center justify-center text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav aria-label="Dashboard" className="min-h-0 flex-1 overflow-y-auto py-3">
        {collapsed && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand sidebar"
              aria-expanded="false"
              className="flex size-8 items-center justify-center text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <ul role="list" className={cn("space-y-0.5", collapsed ? "px-2" : "px-2")}>
          {sidebarNav.map((item) => (
            <NavItemLink key={item.id} item={item} badges={badges} compact={collapsed} />
          ))}
        </ul>
      </nav>

      {user && (
        <div className={cn("border-t border-sidebar-border", collapsed ? "flex justify-center py-3" : "px-4 py-3")}>
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")} title={collapsed ? user.displayName : undefined}>
            <AvatarDisplay
              avatarUrl={user.avatarUrl}
              oauthAvatarUrl={user.oauthAvatarUrl}
              displayName={user.displayName}
              size="sm"
            />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-sidebar-foreground">{user.displayName}</p>
                <p className="truncate text-[10px] text-sidebar-foreground/60">{user.email}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
