/**
 * DashboardShell — the loader behind every customer dashboard page.
 *
 * Keeps the auth gate, the customer-account provisioning states, the
 * sign-in redirect and the navigation data (menus, registry, badges, the
 * settings-driven fallback), then hands one view model to the
 * `dashboard.shell` surface; the active template pack decides how the frame
 * looks (Core: dashboard/shell/FullShell.tsx or AccountLayout.tsx).
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
 * Navigation never comes from hardcoded routes: menus first, registry second,
 * and while the registry is unavailable the settings-driven fallback
 * (lib/layout/dashboardNav.ts) keeps the sidebar populated.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/clerk";

import { LoginTracker } from "@/components/auth/LoginTracker";
import { LayoutShellProvider } from "@/components/layout/LayoutShellProvider";
import { ThemeStyleInjector } from "@/components/layout/ThemeStyleInjector";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDashboardConfig, useDashboardEnabled, useDashboardPath } from "@/hooks/useDashboardConfig";
import { useEnsureCustomerAccount } from "@/hooks/useEnsureCustomerAccount";
import { useClerk } from "@/lib/auth/clerk";
import { Button } from "@/components/ui/button";
import CoreDashboardShell, { type DashboardShellSurfaceData } from "@/templates/packs/core/surfaces/dashboard.shell";
import { Surface } from "@/templates/sdk/Surface";
import { DashboardShellContext, type DashboardShellValue } from "./shell/DashboardShellContext";
import {
  useDashboardBadges,
  useDashboardMenu,
  useDashboardRegistry,
  useFallbackNav,
  useRegistryNav,
} from "./shell/useDashboardNav";
import type { NavItem } from "./nav";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const enabled = useDashboardEnabled();
  const redirected = useRef(false);
  // Make sure the signed-in Clerk identity has an account row on this site
  // (created on first sign-in when no webhook is configured yet).
  const account = useEnsureCustomerAccount();
  const { signOut } = useClerk();

  useEffect(() => {
    // Redirect once; the pathname flips to /login before this tree unmounts,
    // so a second run would overwrite returnTo with the login path itself.
    if (isLoaded && !isSignedIn && !redirected.current && !pathname.startsWith("/login")) {
      redirected.current = true;
      navigate({ to: "/login", search: { returnTo: `${pathname}${searchStr ?? ""}` } } as never);
    }
  }, [isLoaded, isSignedIn, navigate, pathname]);

  if (isLoaded && isSignedIn && account.status === "unavailable") {
    const copy =
      account.reason === "registration_closed"
        ? "This site is not accepting new accounts right now. If you were invited, open the invitation link you received; otherwise contact the site owner."
        : account.reason === "email_conflict"
          ? "Your email address is already linked to a different sign-in on this site. Sign in with that account, or contact support to merge them."
          : account.reason === "email_unverified"
            ? "Verify your email address with your sign-in provider, then reload this page."
            : account.reason === "local_account"
              ? "This email belongs to a site administrator account. Sign in to the admin instead, or use a different email for your customer account."
              : "We could not set up your account on this site. Please try again in a moment or contact support.";
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4 text-center">
        <div className="flex max-w-md flex-col items-center gap-4" role="alert">
          <h1 className="text-lg font-semibold text-foreground">Your account is not available here</h1>
          <p className="text-sm text-muted-foreground">{copy}</p>
          {account.detail && account.reason === "error" && (
            <p className="text-xs text-muted-foreground">{account.detail}</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Button type="button" onClick={() => void signOut({ redirectUrl: "/" })}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded || !isSignedIn || enabled === null || account.status === "loading" || account.status === "provisioning") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3" role="status" aria-live="polite">
          <div className="size-5 animate-spin rounded-none border-2 border-muted border-t-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {!isLoaded || enabled === null
              ? "Loading your dashboard…"
              : !isSignedIn
                ? "Redirecting to sign in…"
                : account.status === "provisioning"
                  ? "Setting up your account…"
                  : "Loading your dashboard…"}
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

/** Resolves menus, registry, badges and the member once; provides them to the surface, the chrome and the widgets. */
function ShellData({ children, compact }: { children: ReactNode; compact: boolean }) {
  const { config } = useDashboardConfig();
  const { basePath, to } = useDashboardPath();
  const registry = useDashboardRegistry();
  const badges = useDashboardBadges();
  const { user } = useCurrentUser();

  const wantsSidebar = config.layout !== "topbar";
  const wantsTopbarNav = config.layout !== "sidebar";
  const sidebarMenu = useDashboardMenu(config.sidebarLocation, basePath, !compact);
  const topbarMenu = useDashboardMenu(config.topbarLocation, basePath, !compact && wantsTopbarNav);
  const profileMenu = useDashboardMenu(config.profileLocation, basePath);
  const generatedNav = useRegistryNav(registry, basePath, { withHeadings: true });
  const generatedFlat = useRegistryNav(registry, basePath, { withHeadings: false });
  // Settings-driven list (DASHBOARD_NAV_ITEMS + commerce/membership/LMS pages,
  // plugin-gated) used until the registry answers or when it is unavailable.
  const fallbackNav = useFallbackNav(basePath);

  const sidebarNav: NavItem[] = sidebarMenu.nav ?? (registry ? generatedNav : fallbackNav);
  const topbarNav: NavItem[] = topbarMenu.nav ?? (wantsSidebar ? [] : registry ? generatedFlat : fallbackNav);
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

  const unread = badges?.["notifications.unread"];
  const surfaceData: DashboardShellSurfaceData = {
    config,
    compact,
    sidebarNav,
    topbarNav,
    profileNav,
    sidebarFromMenu: value.sidebarFromMenu,
    badges,
    unreadCount: typeof unread === "number" && unread > 0 ? unread : 0,
    user: user ?? null,
    to,
    children,
  };

  return (
    <DashboardShellContext value={value}>
      <ThemeStyleInjector />
      <Surface name="dashboard.shell" data={surfaceData} fallback={CoreDashboardShell} />
      <LoginTracker />
    </DashboardShellContext>
  );
}

/** Fallback profile dropdown when no profile menu is assigned. */
function defaultProfileNav(to: (path?: string) => string): NavItem[] {
  return [
    { id: "profile", kind: "link", label: "Profile", href: to("/profile"), icon: "user", exact: false, external: false, children: [] },
    { id: "settings", kind: "link", label: "Settings", href: to("/settings"), icon: "settings", exact: false, external: false, children: [] },
  ];
}
