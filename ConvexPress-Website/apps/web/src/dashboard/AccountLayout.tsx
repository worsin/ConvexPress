/**
 * Compact "account" frame used when the Dashboard plugin is disabled: the
 * site header and footer wrap a tabbed account page hosting the same page
 * modules (profile, settings, security, notifications). Any other dashboard
 * page still renders below the tabs so no URL stops working.
 */

import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import { MobileNav } from "@/components/layout/MobileNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { cn } from "@/lib/utils";
import { resolveIcon } from "./icons";
import { isNavItemActive, type NavItem } from "./nav";
import { getPageModule } from "./registry";
import { useDashboardShell } from "./shell/DashboardShellContext";

/**
 * Account tabs. `notifications` is owned by the notifications + tickets stream
 * (dashboard/pages/notifications/); the tab appears once that module exists.
 */
const ACCOUNT_TABS: Array<{ id: string; label: string; icon: string; path: string }> = [
  { id: "profile", label: "Profile", icon: "user", path: "/profile" },
  { id: "settings", label: "Settings", icon: "settings", path: "/settings" },
  { id: "security", label: "Security", icon: "shield-check", path: "/security" },
  { id: "notifications", label: "Notifications", icon: "bell", path: "/notifications" },
];

export function AccountLayout({ children }: { children: ReactNode }) {
  const siteIdentity = useSiteIdentity();
  const headerConfig = useHeaderConfig();
  const headerMenu = useMenuForLocation("header");
  const { to, badges, config } = useDashboardShell();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const tabs: NavItem[] = ACCOUNT_TABS.filter((tab) => getPageModule(tab.id)).map((tab) => ({
    id: tab.id,
    kind: "link",
    label: tab.label,
    href: to(tab.path),
    icon: tab.icon,
    badge: tab.id === "notifications" ? "notifications.unread" : undefined,
    exact: false,
    external: false,
    children: [],
  }));

  return (
    <>
      <MobileNav menu={headerMenu} siteIdentity={siteIdentity} config={headerConfig.mobileMenu} userMenu={headerConfig.userMenu} />
      <SkipToContent />
      <SiteHeader siteIdentity={siteIdentity} menu={headerMenu} />
      <main id="main-content" role="main" className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Your account</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Profile, preferences, and security in one place.</p>
        </header>
        <nav aria-label="Account sections" className="mb-6 border-b border-border">
          <ul role="list" className="-mb-px flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = resolveIcon(tab.icon);
              const active = isNavItemActive(tab, pathname);
              const count = tab.badge ? badges?.[tab.badge] ?? 0 : 0;
              return (
                <li key={tab.id}>
                  <Link
                    to={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm outline-hidden transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {tab.label}
                    {count > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {children}
      </main>
      {config.footerVariant !== "none" && <SiteFooter variant={config.footerVariant} />}
    </>
  );
}
