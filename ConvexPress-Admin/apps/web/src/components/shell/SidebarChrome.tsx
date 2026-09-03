/**
 * Sidebar chrome — the stone column with the brand lockup, the site switcher
 * (standalone only), an arbitrary body, and the operator footer.
 *
 * `AdminSidebar` fills the body with site navigation. `StandaloneFrame` uses
 * the same chrome with an empty body while no site is open, so the shell
 * never changes shape between states.
 */

import type { ReactNode } from "react";

import { BrandLockup } from "@/components/brand/BrandLockup";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_TRANSITION_MS,
} from "@/lib/admin-shell/constants";
import { isMacElectron } from "@/lib/electron";
import { cn } from "@/lib/utils";
import { OperatorFooter } from "./OperatorFooter";
import { SiteSwitcher } from "./SiteSwitcher";

interface SidebarChromeProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  siteRoleName?: string | null;
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
  /** Render as a fixed-width column (default) or fill its container. */
  fluid?: boolean;
}

export function SidebarBrandRow({ collapsed }: { collapsed: boolean }) {
  const macElectron = isMacElectron();
  return (
    <div
      className={cn(
        "flex h-[52px] shrink-0 items-center",
        collapsed ? "justify-center px-2" : "px-3.5",
        // macOS traffic lights sit at the top-left of the window.
        macElectron && !collapsed && "pl-[76px]",
        macElectron && "app-drag",
      )}
    >
      {!(macElectron && collapsed) && (
        <BrandLockup collapsed={collapsed} size={28} className="app-no-drag" />
      )}
    </div>
  );
}

export function SidebarChrome({
  collapsed,
  onToggleCollapse,
  siteRoleName,
  ariaLabel,
  children,
  className,
  fluid = false,
}: SidebarChromeProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] ease-in-out",
        className,
      )}
      style={
        fluid
          ? undefined
          : {
              width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
              transitionDuration: `${SIDEBAR_TRANSITION_MS}ms`,
            }
      }
    >
      <SidebarBrandRow collapsed={collapsed} />
      <div className={cn("shrink-0", collapsed ? "px-2 pb-2" : "px-3 pb-2")}>
        <SiteSwitcher collapsed={collapsed} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <OperatorFooter
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        siteRoleName={siteRoleName}
      />
    </nav>
  );
}
