/**
 * Aster · dashboard.shell — the frame around every member dashboard page.
 *
 * Full mode (Dashboard plugin enabled): one calm header row (wordmark, the
 * topbar links when the layout asks for them, search / bell / theme), then a
 * quiet left rail of text links — no icons, small-caps section labels, the
 * active link in `text-primary`, the member and "Sign out" at the foot — and
 * the content column in a reading-ish measure. Mobile keeps the shared
 * MobileDrawer. Compact mode (plugin disabled): the site header and footer
 * surfaces around a small-caps account tab line.
 *
 * Navigation, badges and the member arrive through `data`, exactly as Core
 * receives them; the footer is the pack's own `chrome.footer` surface.
 */
import { Link } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";

import { AvatarDisplay } from "@/components/dashboard/profile/AvatarDisplay";
import { getBackgroundInertProps } from "@/components/layout/LayoutShellProvider";
import { SkipToContent } from "@/components/layout/SkipToContent";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { WebsiteNotificationBell } from "@/components/layout/WebsiteNotificationBell";
import type { NavItem } from "@/dashboard/nav";
import { getPageModule } from "@/dashboard/registry";
import { MobileDrawer } from "@/dashboard/shell/MobileDrawer";
import { useFooterConfig } from "@/hooks/layout/useFooterConfig";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import { useLayoutConfig } from "@/hooks/layout/useLayoutConfig";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { useClerk } from "@/lib/auth/clerk";
import type { DashboardConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import CoreFooter from "@/templates/packs/core/surfaces/chrome.footer";
import CoreHeader from "@/templates/packs/core/surfaces/chrome.header";
import CoreMobileNav from "@/templates/packs/core/surfaces/chrome.mobileNav";
import CoreSearchOverlay from "@/templates/packs/core/surfaces/chrome.searchOverlay";
import type { DashboardShellSurfaceData } from "@/templates/packs/core/surfaces/dashboard.shell";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Rule, SmallCaps } from "../parts";
import { InlineNav, PageHeading, RailNav } from "../parts/extra-dashboard";

export default function AsterDashboardShell({ data }: SurfaceProps<DashboardShellSurfaceData>) {
  if (data.compact) return <CompactShell data={data} />;
  return <FullShell data={data} />;
}

/* ───────────────────────── full shell ───────────────────────── */

function FullShell({ data }: { data: DashboardShellSurfaceData }) {
  const { config, sidebarNav, topbarNav, profileNav, badges, user, to, children } = data;
  const { mobileNavOpen, toggleMobileNav, searchOpen, toggleSearch, closeSearch } = useLayoutShell();
  const { signOut } = useClerk();
  const hasRail = config.layout !== "topbar";
  const showTopbarLinks = config.layout !== "sidebar" && topbarNav.length > 0;

  // Profile links that the rail does not already show (Core keeps them in a dropdown).
  const railLinkHrefs = new Set(flattenHrefs(sidebarNav));
  const accountItems = profileNav.filter((item) => item.kind !== "link" || !railLinkHrefs.has(item.href));
  const hasAccountLinks = accountItems.some((item) => item.kind === "link");

  return (
    <>
      <MobileDrawer />
      <div data-slot="dashboard-shell" data-layout={config.layout} className="flex min-h-svh flex-col bg-background text-foreground" {...getBackgroundInertProps(mobileNavOpen)}>
        <SkipToContent />

        <header data-slot="dashboard-topbar" className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
          <Container className="flex h-16 items-center gap-4">
            <button type="button" onClick={toggleMobileNav} aria-label="Open navigation" className="-ml-2 flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground md:hidden">
              <Menu className="size-5" aria-hidden="true" />
            </button>

            <Wordmark config={config} href={to("")} />

            {showTopbarLinks ? <InlineNav items={topbarNav} badges={badges} label="Dashboard sections" className="ml-6 hidden min-w-0 flex-1 md:block" /> : null}

            <div className="ml-auto flex items-center gap-1">
              {config.showSearch ? (
                <button type="button" onClick={toggleSearch} aria-label={searchOpen ? "Close search" : "Search"} aria-expanded={searchOpen} className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
                  <Search className="size-[18px]" aria-hidden="true" />
                </button>
              ) : null}
              {config.showNotificationBell ? <WebsiteNotificationBell /> : null}
              {config.showThemeToggle ? <ThemeToggle /> : null}
              <Link to="/" className="ml-2 hidden text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground sm:inline">
                Visit site
              </Link>
            </div>
          </Container>
        </header>

        {config.showSearch ? <Surface name="chrome.searchOverlay" data={{ open: searchOpen, onClose: closeSearch }} fallback={CoreSearchOverlay} /> : null}

        <Container className="flex-1 py-10 md:py-14">
          <div className={cn(hasRail && "grid gap-12 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16")}>
            {hasRail ? (
              <aside data-slot="dashboard-rail" className="hidden md:block">
                <div className="sticky top-24 flex flex-col gap-6">
                  <RailNav items={sidebarNav} badges={badges} />

                  {hasAccountLinks ? (
                    <>
                      <Rule />
                      <div className="flex flex-col gap-1">
                        <SmallCaps as="p">Account</SmallCaps>
                        <RailNav items={accountItems} badges={badges} label="Account" />
                      </div>
                    </>
                  ) : null}

                  <Rule />
                  <div className="flex flex-col gap-3">
                    {user ? (
                      <div className="flex items-center gap-3">
                        <AvatarDisplay avatarUrl={user.avatarUrl} oauthAvatarUrl={user.oauthAvatarUrl} displayName={user.displayName} size="sm" className="rounded-full" />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{user.displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3" aria-hidden="true">
                        <div className="size-8 animate-pulse rounded-full bg-muted" />
                        <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
                      </div>
                    )}
                    <button type="button" onClick={() => void signOut({ redirectUrl: "/" })} className="self-start text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
                      Sign out
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}

            <main id="main-content" role="main" className="min-w-0">
              <div className="mx-auto w-full max-w-3xl">{children}</div>
            </main>
          </div>
        </Container>

        <ShellFooter variant={config.footerVariant} />
      </div>
    </>
  );
}

/* ───────────────────────── compact shell ───────────────────────── */

const ACCOUNT_TABS: Array<{ id: string; label: string; path: string }> = [
  { id: "profile", label: "Profile", path: "/profile" },
  { id: "settings", label: "Settings", path: "/settings" },
  { id: "security", label: "Security", path: "/security" },
  { id: "notifications", label: "Notifications", path: "/notifications" },
];

function CompactShell({ data }: { data: DashboardShellSurfaceData }) {
  const { config, badges, to, children } = data;
  const siteIdentity = useSiteIdentity();
  const headerConfig = useHeaderConfig();
  const headerMenu = useMenuForLocation(getHeaderMenuLocation(headerConfig.navigation));
  const layoutConfig = useLayoutConfig();
  const { mobileNavOpen, closeMobileNav } = useLayoutShell();

  const tabs: NavItem[] = ACCOUNT_TABS.filter((tab) => getPageModule(tab.id)).map((tab) => ({
    id: tab.id,
    kind: "link",
    label: tab.label,
    href: to(tab.path),
    badge: tab.id === "notifications" ? "notifications.unread" : undefined,
    exact: false,
    external: false,
    children: [],
  }));

  return (
    <>
      <Surface name="chrome.mobileNav" data={{ menu: headerMenu, siteIdentity, config: headerConfig.mobileMenu, open: mobileNavOpen, onClose: closeMobileNav }} fallback={CoreMobileNav} />
      <div data-slot="dashboard-shell" data-layout="compact" className="flex min-h-svh flex-col bg-background text-foreground" {...getBackgroundInertProps(mobileNavOpen)}>
        <SkipToContent />
        <Surface name="chrome.header" data={{ siteIdentity, menu: headerMenu, layoutConfig, headerConfig }} fallback={CoreHeader} />
        <main id="main-content" role="main" className="flex-1">
          <Container className="py-10 md:py-14">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
              <PageHeading eyebrow="Account" title="Your account" lede="Profile, preferences, and security in one place." />
              <InlineNav items={tabs} badges={badges} label="Account sections" className="border-y border-border" />
              {children}
            </div>
          </Container>
        </main>
        <ShellFooter variant={config.footerVariant} />
      </div>
    </>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Wordmark({ config, href }: { config: DashboardConfig; href: string }) {
  const identity = useSiteIdentity();
  const title = identity?.title ?? "";
  const logoUrl = config.brandMark === "custom" && config.customLogoUrl ? config.customLogoUrl : config.brandMark === "site" ? identity?.logoUrl : undefined;
  return (
    <Link to={href as any} data-slot="dashboard-brand" aria-label={`${title} dashboard home`} className="flex min-w-0 items-center gap-3 text-foreground no-underline">
      {logoUrl ? <img src={logoUrl} alt="" width={28} height={28} className="h-7 w-auto shrink-0 object-contain" /> : null}
      <span className="truncate font-display text-xl tracking-tight">{title}</span>
    </Link>
  );
}

function ShellFooter({ variant }: { variant: DashboardConfig["footerVariant"] }) {
  const siteIdentity = useSiteIdentity();
  const footerConfig = useFooterConfig();
  if (variant === "none") return null;
  return <Surface name="chrome.footer" data={{ variant, siteIdentity, footerConfig }} fallback={CoreFooter} />;
}

function flattenHrefs(items: NavItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind === "link") out.push(item.href);
    if (item.children.length) out.push(...flattenHrefs(item.children));
  }
  return out;
}

function getHeaderMenuLocation(navigation: { menuSource: string; customLocation?: string }): string {
  if (navigation.menuSource === "secondary") return "secondary";
  if (navigation.menuSource === "custom") return navigation.customLocation?.trim() || "header";
  return "header";
}
