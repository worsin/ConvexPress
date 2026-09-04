/**
 * DashboardShell — the frame around every customer dashboard page.
 *
 * Honors every `dashboardConfig` field (design-kit/DASHBOARD.md):
 *   layout             sidebar | topbar | both
 *   sidebarLocation    menu → sidebar; empty/unassigned → generated from the registry
 *   topbarLocation     menu → topbar links (only when layout renders a topbar nav)
 *   profileLocation    menu → profile dropdown; unassigned → Profile / Settings / Sign out
 *   sidebarWidth, sidebarCollapsedByDefault (member preference persists)
 *   showSearch, showNotificationBell, showThemeToggle, brandMark, footerVariant
 *
 * When the Dashboard plugin is disabled the same page modules render inside
 * the compact AccountLayout instead (site header + tabbed account page).
 * Navigation never comes from hardcoded routes: menus first, registry second.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";

import { LoginTracker } from "@/components/auth/LoginTracker";
import { LayoutShellProvider, getBackgroundInertProps } from "@/components/layout/LayoutShellProvider";
import { SearchOverlay } from "@/components/layout/SearchOverlay";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { ThemeStyleInjector } from "@/components/layout/ThemeStyleInjector";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useDashboardConfig, useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import { AccountLayout } from "./AccountLayout";
import { DashboardShellContext, type DashboardShellValue } from "./shell/DashboardShellContext";
import { MobileDrawer } from "./shell/MobileDrawer";
import { ShellFooter } from "./shell/ShellFooter";
import { SidebarNav } from "./shell/SidebarNav";
import { Topbar } from "./shell/Topbar";
import {
  useDashboardBadges,
  useDashboardMenu,
  useDashboardRegistry,
  useRegistryNav,
} from "./shell/useDashboardNav";
import { useSidebarCollapsed } from "./shell/useSidebarCollapsed";
import type { NavItem } from "./nav";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const enabled = useDashboardEnabled();
  const redirected = useRef(false);

  useEffect(() => {
    // Redirect once; the pathname flips to /login before this tree unmounts,
    // so a second run would overwrite returnTo with the login path itself.
    if (isLoaded && !isSignedIn && !redirected.current && !pathname.startsWith("/login")) {
      redirected.current = true;
      navigate({ to: "/login", search: { returnTo: pathname } } as never);
    }
  }, [isLoaded, isSignedIn, navigate, pathname]);

  if (!isLoaded || !isSignedIn || enabled === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3" role="status" aria-live="polite">
          <div className="size-5 animate-spin rounded-none border-2 border-muted border-t-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {!isLoaded || enabled === null ? "Loading your dashboard…" : "Redirecting to sign in…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <LayoutShellProvider>
      <ShellData compact={!enabled}>{children}</ShellData>
    </LayoutShellProvider>
  );
}

/** Resolves menus, registry, and badges once; provides them to the chrome and widgets. */
function ShellData({ children, compact }: { children: ReactNode; compact: boolean }) {
  const { config } = useDashboardConfig();
  const { basePath, to } = useDashboardPath();
  const registry = useDashboardRegistry();
  const badges = useDashboardBadges();

  const wantsSidebar = config.layout !== "topbar";
  const wantsTopbarNav = config.layout !== "sidebar";
  const sidebarMenu = useDashboardMenu(config.sidebarLocation, basePath, !compact);
  const topbarMenu = useDashboardMenu(config.topbarLocation, basePath, !compact && wantsTopbarNav);
  const profileMenu = useDashboardMenu(config.profileLocation, basePath);
  const generatedNav = useRegistryNav(registry, basePath, { withHeadings: true });
  const generatedFlat = useRegistryNav(registry, basePath, { withHeadings: false });

  const sidebarNav: NavItem[] = sidebarMenu.nav ?? generatedNav;
  const topbarNav: NavItem[] = topbarMenu.nav ?? (wantsSidebar ? [] : generatedFlat);
  const profileNav: NavItem[] = profileMenu.nav ?? defaultProfileNav(to);

  const value: DashboardShellValue = {
    config,
    sidebarNav,
    topbarNav,
    profileNav,
    sidebarFromMenu: Boolean(sidebarMenu.nav),
    badges,
    registry,
    to,
    compact,
  };

  return (
    <DashboardShellContext value={value}>
      <ThemeStyleInjector />
      {compact ? <AccountLayout>{children}</AccountLayout> : <FullShell>{children}</FullShell>}
      <LoginTracker />
    </DashboardShellContext>
  );
}

function FullShell({ children }: { children: ReactNode }) {
  const { config } = useDashboardConfigFromShell();
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
        style={{ "--dashboard-sidebar-width": `${config.sidebarWidth}px` } as React.CSSProperties}
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

function useDashboardConfigFromShell() {
  return useDashboardConfig();
}

/** Fallback profile dropdown when no profile menu is assigned. */
function defaultProfileNav(to: (path?: string) => string): NavItem[] {
  return [
    { id: "profile", kind: "link", label: "Profile", href: to("/profile"), icon: "user", exact: false, external: false, children: [] },
    { id: "settings", kind: "link", label: "Settings", href: to("/settings"), icon: "settings", exact: false, external: false, children: [] },
  ];
}
