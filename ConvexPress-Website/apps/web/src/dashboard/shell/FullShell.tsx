/**
 * The full dashboard frame: mobile drawer, desktop sidebar (collapsible),
 * topbar, search overlay, the content column and the footer. Reads the
 * resolved navigation from DashboardShellContext; the Core `dashboard.shell`
 * surface composes it when the Dashboard plugin is enabled.
 */

import type { CSSProperties, ReactNode } from "react";

import { getBackgroundInertProps } from "@/components/layout/LayoutShellProvider";
import { SearchOverlay } from "@/components/layout/SearchOverlay";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";
import { MobileDrawer } from "./MobileDrawer";
import { ShellFooter } from "./ShellFooter";
import { SidebarNav } from "./SidebarNav";
import { Topbar } from "./Topbar";
import { useSidebarCollapsed } from "./useSidebarCollapsed";

export function FullShell({ children }: { children: ReactNode }) {
  const { config } = useDashboardConfig();
  const { mobileNavOpen } = useLayoutShell();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed(config.sidebarCollapsedByDefault);
  const hasSidebar = config.layout !== "topbar";

  return (
    <>
      <MobileDrawer />
      <div
        data-slot="dashboard-shell"
        data-layout={config.layout}
        className="flex min-h-svh bg-background text-foreground"
        style={{ "--dashboard-sidebar-width": `${config.sidebarWidth}px` } as CSSProperties}
        {...getBackgroundInertProps(mobileNavOpen)}
      >
        <SkipToContent />
        {hasSidebar && <SidebarNav collapsed={collapsed} onToggle={toggleCollapsed} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar hasSidebar={hasSidebar} />
          <SearchOverlay />
          <main id="main-content" role="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
          <ShellFooter variant={config.footerVariant} />
        </div>
      </div>
    </>
  );
}
