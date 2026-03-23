import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import type { LayoutConfig, ResolvedMenu, SiteIdentity } from "@/lib/layout/types";

import { DesktopNav } from "./DesktopNav";
import { HeaderActions } from "./HeaderActions";
import { SearchOverlay } from "./SearchOverlay";
import { SiteBrand } from "./SiteBrand";

interface SiteHeaderProps {
  siteIdentity: SiteIdentity | undefined;
  menu: ResolvedMenu | undefined;
  layoutConfig?: LayoutConfig;
}

/**
 * Main site header containing logo/brand, primary navigation, search toggle, and user menu.
 * Sticky by default with scroll-aware shadow.
 */
export function SiteHeader({ siteIdentity, menu, layoutConfig }: SiteHeaderProps) {
  const { isScrolled, toggleMobileNav } = useLayoutShell();
  const stickyHeader = layoutConfig?.stickyHeader !== false;

  return (
    <header
      data-slot="site-header"
      role="banner"
      className={cn(
        "z-40 w-full border-b border-border bg-background transition-shadow",
        stickyHeader && "sticky top-0",
        isScrolled && "bg-background/95 shadow-sm backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-14 items-center justify-between px-4 md:px-6 lg:h-16 lg:px-8">
        {/* Left: Hamburger (mobile) + Brand */}
        <div className="flex items-center gap-3">
          {/* Hamburger menu - mobile only */}
          <button
            type="button"
            onClick={toggleMobileNav}
            className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <SiteBrand siteIdentity={siteIdentity} />
        </div>

        {/* Center: Desktop navigation */}
        <DesktopNav menu={menu} className="mx-6 flex-1" />

        {/* Right: Actions */}
        <HeaderActions />
      </div>

      {/* Search overlay - renders below header bar when open */}
      <SearchOverlay />
    </header>
  );
}
