import { HeaderSearchInline, HeaderSearchExpansion, HeaderSearchTrigger } from "@/components/layout/HeaderSearch";
import { HeaderMainRow } from "@/components/layout/HeaderMainRow";
import { headerAppearance, headerHeight } from "@/lib/layout/headerAppearance";
import { resolveHeaderBrand } from "@/lib/layout/headerBrand";
import { MenuItemTarget, dismissMenuOnEscape } from "@/components/menus/MenuItemTarget";
import { useStickyHeaderOffset } from "@/hooks/layout/useStickyHeaderOffset";
/**
 * Aster · chrome.header — one calm row: wordmark left, primary menu centred
 * as text links, search / account / cart on the right. Sticky, translucent,
 * hairline bottom border. On the front page only, the site tagline sits on a
 * line beneath.
 *
 * Same actions as Core: search toggles the search overlay surface, the cart
 * button opens the cart drawer surface, the account cluster follows the
 * header's user-menu settings.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Menu, ShoppingBag, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { NavDropdown } from "@/components/layout/NavDropdown";
import { HeaderTopBar } from "@/components/layout/HeaderTopBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { WebsiteNotificationBell } from "@/components/layout/WebsiteNotificationBell";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/lib/auth/clerk";
import { DROPDOWN_TIMING } from "@/lib/layout/constants";
import type { HeaderConfig, ResolvedMenuItem, SiteIdentity } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import CoreCartDrawer from "@/templates/packs/core/surfaces/chrome.cartDrawer";
import type { HeaderSurfaceData } from "@/templates/packs/core/surfaces/chrome.header";
import CoreSearchOverlay from "@/templates/packs/core/surfaces/chrome.searchOverlay";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container } from "../parts";

export default function AsterChromeHeader({ data }: SurfaceProps<HeaderSurfaceData>) {
  const { siteIdentity, menu, layoutConfig, headerConfig } = data;
  const { toggleMobileNav, searchOpen, closeSearch } = useLayoutShell();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const stickyMode = headerConfig.layout.sticky;
  const isSticky = stickyMode === "always" || (stickyMode === "scroll-up" && layoutConfig?.stickyHeader !== false);
  const headerRef = useStickyHeaderOffset(isSticky, stickyMode);
  const appearance = headerAppearance(headerConfig.layout);
  const isHome = pathname === "/";
  const tagline = resolveHeaderBrand(siteIdentity, headerConfig.logo).showTagline ? siteIdentity?.tagline?.trim() : undefined;
  const visibleItems = menu?.items.filter((item) => !item.isOrphaned) ?? [];

  const mobileToggle = (<button
            type="button"
            onClick={toggleMobileNav}
            className="-ml-2 flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>);
  const navigation = (headerConfig.navigation.enabled ? (
          <nav data-slot="desktop-nav" data-customize="menuLayout.primary" aria-label="Primary navigation" className="hidden justify-center lg:flex">
            {visibleItems.length > 0 ? (
              <ul role="list" className="flex items-center gap-1">
                {visibleItems.map((item) => (
                  <NavItem key={item.id} item={item} config={headerConfig.navigation} />
                ))}
              </ul>
            ) : null}
          </nav>
        ) : null);
  const actions = (<div data-slot="header-actions" className="flex shrink-0 items-center justify-end gap-0 sm:gap-1">
          <HeaderSearchTrigger config={headerConfig.search} />
          {headerConfig.cta.enabled ? (
            <Link
              to={headerConfig.cta.url as any}
              className={cn(
                "mx-1 hidden h-9 items-center rounded-full px-4 text-sm font-medium transition-colors md:inline-flex",
                headerConfig.cta.style === "outline"
                  ? "border border-border text-foreground hover:border-foreground/40"
                  : headerConfig.cta.style === "ghost"
                    ? "text-foreground hover:bg-muted/60"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {headerConfig.cta.label}
            </Link>
          ) : null}
          {headerConfig.darkModeToggle.enabled ? <ThemeToggle variant={headerConfig.darkModeToggle.variant} /> : null}
          <AccountCluster userMenu={headerConfig.userMenu} />
          <CartButton />
        </div>);

  return (
    <header
      ref={headerRef}
      data-pack="aster-house" data-slot="site-header" data-customize="header.layout.sticky"
      role="banner"
      className={cn(
        "z-40 w-full",
        appearance.background, appearance.border,
        isSticky && "sticky top-0",
      )}
    >
      {headerConfig.topBar.enabled ? <TopBar config={headerConfig.topBar} /> : null}

      <Container>
        <HeaderMainRow
          style={headerConfig.layout.style}
          heightClass={headerHeight(headerConfig.layout.height, "aster-house")}
          brand={<Wordmark siteIdentity={siteIdentity} logo={headerConfig.logo} />}
          mobileToggle={mobileToggle}
          navigation={navigation}
          search={headerConfig.search.enabled && headerConfig.search.variant === "inline" && <HeaderSearchInline config={headerConfig.search} pack="aster-house" />}
          actions={actions}
        />
        <HeaderSearchInline config={headerConfig.search} pack="aster-house" mobile />
        <HeaderSearchExpansion config={headerConfig.search} pack="aster-house" />
      </Container>

      {isHome && tagline ? (
        <div className="border-t border-border">
          <Container>
            <p className="py-2.5 text-center font-display text-sm tracking-wide text-muted-foreground">{tagline}</p>
          </Container>
        </div>
      ) : null}

      {headerConfig.search.enabled && headerConfig.search.variant === "icon" ? (
        <Surface name="chrome.searchOverlay" data={{ open: searchOpen, onClose: closeSearch, placeholder: headerConfig.search.placeholder }} fallback={CoreSearchOverlay} />
      ) : null}
    </header>
  );
}

/* ───────────────────────── wordmark ───────────────────────── */

function Wordmark({ siteIdentity, logo }: { siteIdentity: SiteIdentity | undefined; logo: HeaderConfig["logo"] }) {
  if (!logo.enabled) return null;
  if (!siteIdentity) {
    return (
      <div data-slot="site-brand" data-customize="header.logo.showTitle" className="flex items-center">
        <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }
  const { showImage: showLogo, showTitle, imageSize } = resolveHeaderBrand(siteIdentity, logo, 28);
  if (!showLogo && !showTitle) return null;
  return (
    <Link to="/" data-slot="site-brand" data-customize="header.logo.showTitle" className="flex min-w-0 items-center gap-3 text-foreground no-underline">
      {showLogo ? <img src={siteIdentity.logoUrl} alt={siteIdentity.logoAlt || siteIdentity.title} className="w-auto max-w-full shrink-0 object-contain" style={{ height: imageSize }} width={imageSize} height={imageSize} /> : null}
      {showTitle ? <span className="truncate font-display text-xl tracking-tight">{siteIdentity.title}</span> : null}
    </Link>
  );
}

/* ───────────────────────── announcement row ───────────────────────── */

function TopBar({ config }: { config: HeaderConfig["topBar"] }) {
  return (
    <div className="border-b border-border">
      <Container>
        <HeaderTopBar config={config} icons={false} className="min-h-8 text-[11px] uppercase tracking-[0.18em] text-muted-foreground" />
      </Container>
    </div>
  );
}

/* ───────────────────────── menu items ───────────────────────── */

function NavItem({ item, config }: { item: ResolvedMenuItem; config: HeaderConfig["navigation"] }) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasChildren = item.children.length > 0;

  const onEnter = useCallback(() => {
    if (!hasChildren) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), DROPDOWN_TIMING.openDelay);
  }, [hasChildren]);

  const onLeave = useCallback(() => {
    if (!hasChildren) return;
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), DROPDOWN_TIMING.closeDelay);
  }, [hasChildren]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!hasChildren) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
      }
    },
    [hasChildren],
  );

  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const linkProps = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
  const linkClass = cn(
    "flex items-center gap-1 px-3 py-2 text-sm tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    config.style === "pills" && "rounded-full border border-transparent hover:border-border hover:bg-muted",
    config.style === "underline" && "border-b border-transparent px-2 hover:border-foreground",
    item.cssClasses,
  );
  const content = (
    <>
      <span>{item.label}</span>
      {hasChildren ? <ChevronDown className={cn("size-3 opacity-60 transition-transform", open && "rotate-180")} aria-hidden="true" /> : null}
    </>
  );

  return (
    <li data-slot="desktop-nav-item" className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}
      onKeyDown={(event) => dismissMenuOnEscape(event, open, () => {
        if (openTimer.current) clearTimeout(openTimer.current);
        setOpen(false);
      })}>
      <MenuItemTarget
          item={item}
          separatorOrientation="vertical"
          onToggle={hasChildren ? () => setOpen(value => !value) : undefined}
          className={linkClass}
          activeProps={{ className: "text-foreground", "aria-current": "page" as const }}
          onKeyDown={onKeyDown}
          aria-expanded={hasChildren ? open : undefined}
          aria-haspopup={hasChildren ? "true" : undefined}
          {...linkProps}
        >
          {content}
        </MenuItemTarget>
      {hasChildren && (open || item.type === "separator") ? <NavDropdown items={item.children} onNavigate={() => { if (openTimer.current) clearTimeout(openTimer.current); setOpen(false); }} depth={0} className={item.type === "separator" ? "static shadow-none ring-0" : cn("rounded-xl", config.dropdownStyle === "mega" && "grid min-w-72 grid-cols-2")} /> : null}
    </li>
  );
}

/* ───────────────────────── account + cart ───────────────────────── */

function AccountCluster({ userMenu }: { userMenu: HeaderConfig["userMenu"] }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!userMenu.enabled || !isLoaded) return null;
  if (isSignedIn) {
    return (
      <>
        <WebsiteNotificationBell />
        <UserMenu />
      </>
    );
  }
  if (userMenu.guestDisplay === "hidden") return null;
  return (
    <div className="flex shrink-0 items-center gap-3 sm:px-2">
      <Link to="/login" aria-label="Sign in" className="flex size-10 shrink-0 items-center justify-center whitespace-nowrap text-sm tracking-wide text-muted-foreground transition-colors hover:text-foreground sm:w-auto">
        <UserRound className="size-[18px] sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
      {userMenu.guestDisplay === "login-register" ? (
        <Link to="/register" className="hidden text-sm tracking-wide text-muted-foreground transition-colors hover:text-foreground sm:inline">
          Register
        </Link>
      ) : null}
    </div>
  );
}

function CartButton() {
  const { enabled, cart } = useCart();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const count = cart?.itemCount ?? 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Cart${count ? `, ${count} items` : ""}`}
      >
        <ShoppingBag className="size-[18px]" aria-hidden="true" />
        {count ? (
          <span className="absolute -right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 tabular-nums text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      <Surface name="chrome.cartDrawer" data={{ open, onOpenChange: setOpen }} fallback={CoreCartDrawer} />
    </>
  );
}
