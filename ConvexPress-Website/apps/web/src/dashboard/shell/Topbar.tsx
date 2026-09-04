/**
 * Top bar: mobile menu trigger, brand (when there is no sidebar), topbar
 * links, and the action cluster (search, notifications, theme, profile) —
 * each toggled by dashboardConfig.
 */

import { Menu, Search } from "lucide-react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { WebsiteNotificationBell } from "@/components/layout/WebsiteNotificationBell";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { NavItemLink } from "./NavItemLink";
import { ProfileMenu } from "./ProfileMenu";
import { useDashboardShell } from "./DashboardShellContext";

interface TopbarProps {
  /** True when the desktop sidebar is rendered (brand lives there). */
  hasSidebar: boolean;
}

export function Topbar({ hasSidebar }: TopbarProps) {
  const { config, topbarNav, profileNav, badges, to } = useDashboardShell();
  const { toggleMobileNav, toggleSearch, searchOpen } = useLayoutShell();
  const showTopbarLinks = config.layout !== "sidebar" && topbarNav.length > 0;

  return (
    <header
      data-slot="dashboard-topbar"
      className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
    >
      <button
        type="button"
        onClick={toggleMobileNav}
        aria-label="Open navigation"
        className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <BrandMark config={config} href={to("")} className={cn("mr-2", hasSidebar && "md:hidden")} />

      {showTopbarLinks && (
        <nav aria-label="Dashboard sections" className="hidden min-w-0 flex-1 md:block">
          <ul role="list" className="flex items-center gap-0.5 overflow-x-auto">
            {topbarNav.map((item) => (
              <NavItemLink key={item.id} item={item} badges={badges} inline />
            ))}
          </ul>
        </nav>
      )}

      <div className="ml-auto flex items-center gap-1">
        {config.showSearch && (
          <button
            type="button"
            onClick={toggleSearch}
            aria-label={searchOpen ? "Close search" : "Search"}
            aria-expanded={searchOpen}
            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
        )}
        {config.showNotificationBell && <WebsiteNotificationBell />}
        {config.showThemeToggle && <ThemeToggle />}
        <ProfileMenu items={profileNav} badges={badges} className="ml-1" />
      </div>
    </header>
  );
}
