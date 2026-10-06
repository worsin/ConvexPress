/**
 * Depot · dashboard.shell — the frame around every member dashboard page.
 *
 * Full mode (Dashboard plugin enabled): a sticky two-row top bar — brand and
 * the action cluster (search, notifications, theme, profile menu) on row one,
 * a horizontally scrollable tab strip of sections on row two (badges as
 * counts) — then the page inside the Depot `Container`, then the site footer
 * surface. No left rail: the sidebar / topbar menus resolve into one strip.
 * Compact mode (plugin disabled): the site chrome surfaces around a tabbed
 * account page. Same data as Core.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

import { getBackgroundInertProps } from "@/components/layout/LayoutShellProvider";
import { SearchOverlay } from "@/components/layout/SearchOverlay";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { WebsiteNotificationBell } from "@/components/layout/WebsiteNotificationBell";
import { resolveIcon } from "@/dashboard/icons";
import { badgeCountFor, flattenNavLinks, formatBadge, isNavItemActive, type NavItem } from "@/dashboard/nav";
import { getPageModule } from "@/dashboard/registry";
import { ProfileMenu } from "@/dashboard/shell/ProfileMenu";
import { useFooterConfig } from "@/hooks/layout/useFooterConfig";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import { useLayoutConfig } from "@/hooks/layout/useLayoutConfig";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useHeaderMenu } from "@/hooks/layout/useHeaderMenu";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import type { DashboardConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import CoreFooter from "@/templates/packs/core/surfaces/chrome.footer";
import CoreHeader from "@/templates/packs/core/surfaces/chrome.header";
import CoreMobileNav from "@/templates/packs/core/surfaces/chrome.mobileNav";
import type { DashboardShellSurfaceData } from "@/templates/packs/core/surfaces/dashboard.shell";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Label } from "../parts";
import { dashboardFrame } from "../parts/extra-dashboard";

export default function DepotDashboardShell({ data }: SurfaceProps<DashboardShellSurfaceData>) {
  if (data.compact) return <CompactFrame data={data} />;
  return <FullFrame data={data} />;
}

/* ───────────────────────── full mode ───────────────────────── */

function FullFrame({ data }: { data: DashboardShellSurfaceData }) {
  const { config, sidebarNav, topbarNav, profileNav, badges, to, children } = data;
  const { toggleSearch, searchOpen, mobileNavOpen } = useLayoutShell();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const siteIdentity = useSiteIdentity();
  const footerConfig = useFooterConfig();

  // One strip: the sidebar navigation (menu, registry or fallback) first, then
  // any topbar links it does not already contain. Headings and separators are
  // dropped; nested links flatten into the strip.
  const tabs = dedupeLinks([...flattenNavLinks(sidebarNav), ...(config.layout !== "sidebar" ? flattenNavLinks(topbarNav) : [])]);

  return (
    <div
      data-slot="dashboard-shell"
      data-pack="depot"
      data-layout={config.layout}
      className={cn("flex min-h-svh flex-col bg-background text-foreground", dashboardFrame)}
      {...getBackgroundInertProps(mobileNavOpen)}
    >
      <SkipToContent />
      <header data-slot="dashboard-topbar" className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <Container className="flex h-14 items-center gap-3">
          <Brand config={config} href={to("")} siteTitle={siteIdentity?.title ?? ""} siteLogo={siteIdentity?.logoUrl} />
          <div className="ml-auto flex items-center gap-0.5">
            {config.showSearch && (
              <button
                type="button"
                onClick={toggleSearch}
                aria-label={searchOpen ? "Close search" : "Search"}
                aria-expanded={searchOpen}
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search className="size-4" aria-hidden="true" />
              </button>
            )}
            {config.showNotificationBell && <WebsiteNotificationBell />}
            {config.showThemeToggle && <ThemeToggle />}
            <ProfileMenu items={profileNav} badges={badges} className="ml-1 rounded-md" />
          </div>
        </Container>
        <TabStrip items={tabs} badges={badges} pathname={pathname} label="Dashboard sections" />
      </header>

      <SearchOverlay />

      <main id="main-content" role="main" className="flex-1 py-4 md:py-6">
        <Container>{children}</Container>
      </main>

      {config.footerVariant !== "none" && <Surface name="chrome.footer" data={{ variant: config.footerVariant, siteIdentity, footerConfig }} fallback={CoreFooter} />}
    </div>
  );
}

/* ───────────────────────── compact mode ───────────────────────── */

/** Account tabs in compact mode; a tab appears once its page module exists (as in Core). */
const ACCOUNT_TABS: Array<{ id: string; label: string; icon: string; path: string }> = [
  { id: "profile", label: "Profile", icon: "user", path: "/profile" },
  { id: "settings", label: "Settings", icon: "settings", path: "/settings" },
  { id: "security", label: "Security", icon: "shield-check", path: "/security" },
  { id: "notifications", label: "Notifications", icon: "bell", path: "/notifications" },
];

function CompactFrame({ data }: { data: DashboardShellSurfaceData }) {
  const { config, badges, to, children } = data;
  const { mobileNavOpen, closeMobileNav } = useLayoutShell();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const siteIdentity = useSiteIdentity();
  const headerConfig = useHeaderConfig();
  const layoutConfig = useLayoutConfig();
  const footerConfig = useFooterConfig();
  const headerMenu = useHeaderMenu(headerConfig.navigation);

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
      <Surface name="chrome.mobileNav" data={{ menu: headerMenu, siteIdentity, config: headerConfig.mobileMenu, userMenu: headerConfig.userMenu, open: mobileNavOpen, onClose: closeMobileNav }} fallback={CoreMobileNav} />
      <div data-slot="dashboard-shell" data-pack="depot" data-layout="compact" className={cn("flex min-h-svh flex-col bg-background text-foreground", dashboardFrame)} {...getBackgroundInertProps(mobileNavOpen)}>
        <SkipToContent />
        <Surface name="chrome.header" data={{ siteIdentity, menu: headerMenu, layoutConfig, headerConfig }} fallback={CoreHeader} />
        <main id="main-content" role="main" className="flex-1 py-6 md:py-8">
          <Container className="flex flex-col gap-4">
            <header className="flex flex-col gap-1">
              <Label>Account</Label>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Your account</h1>
              <p className="text-[13px] leading-5 text-muted-foreground">Profile, preferences, and security in one place.</p>
            </header>
            <div className="rounded-md border border-border bg-card">
              <TabStrip items={tabs} badges={badges} pathname={pathname} label="Account sections" padded={false} className="px-2" />
            </div>
            {children}
          </Container>
        </main>
        {config.footerVariant !== "none" && <Surface name="chrome.footer" data={{ variant: config.footerVariant, siteIdentity, footerConfig }} fallback={CoreFooter} />}
      </div>
    </>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Brand({ config, href, siteTitle, siteLogo }: { config: DashboardConfig; href: string; siteTitle: string; siteLogo?: string }) {
  const logoUrl = config.brandMark === "custom" && config.customLogoUrl ? config.customLogoUrl : config.brandMark === "site" ? siteLogo : undefined;
  const initial = siteTitle.trim().charAt(0).toUpperCase() || "•";
  return (
    <Link to={href} data-slot="dashboard-brand" aria-label={`${siteTitle} dashboard home`} className="flex min-w-0 items-center gap-2 text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {logoUrl ? (
        <img src={logoUrl} alt="" width={28} height={28} className="size-7 shrink-0 object-contain" />
      ) : (
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          {initial}
        </span>
      )}
      <span className="truncate text-base font-bold tracking-tight">{siteTitle}</span>
      <Label className="hidden border-l border-border pl-2 sm:inline">Account</Label>
    </Link>
  );
}

/** Horizontally scrollable strip of section tabs; the active tab scrolls into view. */
function TabStrip({ items, badges, pathname, label, padded = true, className }: { items: NavItem[]; badges: Record<string, number> | null; pathname: string; label: string; padded?: boolean; className?: string }) {
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className={cn("overflow-x-auto", padded && "border-t border-border", className)}>
      <Container padded={padded} className="min-w-0">
        <ul role="list" className="flex h-10 items-stretch gap-0.5 whitespace-nowrap">
          {items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const count = badgeCountFor(item, badges);
            const Icon = resolveIcon(item.icon);
            const classes = cn(
              "flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            );
            const body = (
              <>
                <Icon className={cn("size-3.5 shrink-0", active ? "text-primary" : "opacity-80")} aria-hidden="true" />
                <span>{item.label}</span>
                {count > 0 && (
                  <span aria-label={`${formatBadge(count)} new`} className="flex h-4 min-w-4 items-center justify-center rounded-md bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground">
                    {formatBadge(count)}
                  </span>
                )}
              </>
            );
            return (
              <li key={item.id} ref={active ? activeRef : undefined} className="shrink-0">
                {item.external ? (
                  <a href={item.href} target={item.target} rel={item.rel ?? (item.target === "_blank" ? "noopener noreferrer" : undefined)} className={classes}>
                    {body}
                  </a>
                ) : (
                  <Link to={item.href} className={classes} aria-current={active ? "page" : undefined}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </Container>
    </nav>
  );
}

function dedupeLinks(items: NavItem[]): NavItem[] {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const item of items) {
    const key = item.href.split(/[?#]/)[0] ?? item.href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
