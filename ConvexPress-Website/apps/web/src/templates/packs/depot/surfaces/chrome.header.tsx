import { HeaderSearchInline, HeaderSearchExpansion, HeaderSearchTrigger } from "@/components/layout/HeaderSearch";
import CoreSearchOverlay from "@/templates/packs/core/surfaces/chrome.searchOverlay";
import { DesktopNav } from "@/components/layout/DesktopNav";
import { HeaderMainRow } from "@/components/layout/HeaderMainRow";
import { headerAppearance, headerHeight } from "@/lib/layout/headerAppearance";
import { resolveHeaderBrand } from "@/lib/layout/headerBrand";
import { MenuItemTarget } from "@/components/menus/MenuItemTarget";
import { useStickyHeaderOffset } from "@/hooks/layout/useStickyHeaderOffset";
/**
 * Depot · chrome.header — two sticky rows.
 *
 * Row one: wordmark, a prominent search bar, then account, wishlist and the
 * cart with count and subtotal. Row two: department navigation from the
 * header's menu, with an "All" mega dropdown when the menu has children.
 * Same gates as Core (sticky mode, search, CTA, user menu, theme toggle,
 * commerce) — only the arrangement changes.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Heart, Menu, ShoppingCart, User } from "lucide-react";
import { useState } from "react";

import { HeaderTopBar } from "@/components/layout/HeaderTopBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { WebsiteNotificationBell } from "@/components/layout/WebsiteNotificationBell";
import { useSettings } from "@/contexts/SettingsContext";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useCart } from "@/hooks/useCart";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { useAuth } from "@/lib/auth/clerk";
import { formatMoney } from "@/lib/commerce/format";
import type { HeaderConfig, ResolvedMenuItem, SiteIdentity } from "@/lib/layout/types";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { cn } from "@/lib/utils";
import CoreCartDrawer from "@/templates/packs/core/surfaces/chrome.cartDrawer";
import type { HeaderSurfaceData } from "@/templates/packs/core/surfaces/chrome.header";
import { Surface } from "@/templates/sdk/Surface";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Label, buttonClasses } from "../parts";

export default function DepotHeader({ data }: SurfaceProps<HeaderSurfaceData>) {
  const { siteIdentity, menu, layoutConfig, headerConfig } = data;
  const { toggleMobileNav, searchOpen, closeSearch } = useLayoutShell();

  const stickyHeader = layoutConfig?.stickyHeader !== false;
  const stickyMode = headerConfig.layout.sticky;
  const isSticky = stickyMode === "always" || (stickyMode === "scroll-up" && stickyHeader);
  const headerRef = useStickyHeaderOffset(isSticky, stickyMode);
  const appearance = headerAppearance(headerConfig.layout);

  const visibleItems = menu?.items.filter((item) => !item.isOrphaned) ?? [];
  const showNav = headerConfig.navigation.enabled && visibleItems.length > 0;

  const mobileToggle = (<button
          type="button"
          onClick={toggleMobileNav}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>);
  const navigation = !showNav ? null : headerConfig.navigation.dropdownStyle === "flyout" ? (
    <div className="hidden border-t border-border lg:block">
      <Container padded={headerConfig.layout.style === "standard"} className="flex min-h-10 items-center">
        <DesktopNav menu={menu} linkStyle={headerConfig.navigation.style} dropdownStyle="flyout" />
      </Container>
    </div>
  ) : (<nav aria-label="Primary navigation" className="hidden border-t border-border lg:block">
          <Container padded={headerConfig.layout.style === "standard"} className="flex min-h-10 items-center gap-1">
            {visibleItems.some((item) => item.children.length > 0) && <AllDepartments items={visibleItems} />}
            <ul role="list" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {visibleItems.map((item) => (
                <li key={item.id} className="shrink-0">
                  <DepartmentLink item={item} style={headerConfig.navigation.style} />
                </li>
              ))}
            </ul>
          </Container>
        </nav>);

  return (
    <header
      ref={headerRef}
      data-slot="site-header" data-customize="header.layout.sticky"
      data-pack="depot"
      role="banner"
      className={cn("z-40 w-full transition-shadow", appearance.background, appearance.border, isSticky && "sticky top-0")}
    >
      {headerConfig.topBar.enabled && <TopBar config={headerConfig.topBar} />}

      <Container>
        <HeaderMainRow
          style={headerConfig.layout.style}
          heightClass={headerHeight(headerConfig.layout.height, "depot")}
          brand={<Wordmark siteIdentity={siteIdentity} logo={headerConfig.logo} />}
          mobileToggle={mobileToggle}
          navigation={headerConfig.layout.style === "standard" ? undefined : navigation}
          search={headerConfig.search.enabled && headerConfig.search.variant === "inline" && <HeaderSearchInline config={headerConfig.search} pack="depot" />}
          actions={<HeaderCluster headerConfig={headerConfig} className="ml-auto" />}
        />
        <HeaderSearchInline config={headerConfig.search} pack="depot" mobile />
        <HeaderSearchExpansion config={headerConfig.search} pack="depot" />
      </Container>

      {headerConfig.search.enabled && headerConfig.search.variant === "icon" && (
        <Surface name="chrome.searchOverlay" data={{ open: searchOpen, onClose: closeSearch, placeholder: headerConfig.search.placeholder }} fallback={CoreSearchOverlay} />
      )}

      {headerConfig.layout.style === "standard" && navigation}
    </header>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Wordmark({ siteIdentity, logo }: { siteIdentity: SiteIdentity | undefined; logo: HeaderConfig["logo"] }) {
  if (!logo.enabled) return null;
  if (!siteIdentity) return <div className="h-5 w-24 animate-pulse rounded-md bg-muted" aria-hidden="true" />;
  const { showImage, showTitle, showTagline, imageSize } = resolveHeaderBrand(siteIdentity, logo);
  if (!showImage && !showTitle && !showTagline) return null;
  return (
    <Link to="/" data-slot="site-brand" data-customize="header.logo.showTitle" className="flex min-w-0 items-center gap-2 text-foreground no-underline">
      {showImage && <img src={siteIdentity.logoUrl} alt={siteIdentity.logoAlt || siteIdentity.title} className="w-auto min-w-0 max-w-32 object-contain" style={{ height: imageSize }} width={imageSize} height={imageSize} />}
      {showTitle && <span className="min-w-0 truncate text-base font-bold tracking-tight">{siteIdentity.title}</span>}
      {showTagline ? <span className={cn("min-w-0 truncate text-[13px] text-muted-foreground", (showImage || showTitle) && "hidden xl:inline")}>{siteIdentity.tagline}</span> : null}
    </Link>
  );
}

function HeaderCluster({ headerConfig, className }: { headerConfig: HeaderConfig; className?: string }) {
  const { isSignedIn, isLoaded } = useAuth();
  const settings = useSettings();
  const { to } = useDashboardPath();
  const [cartOpen, setCartOpen] = useState(false);
  const { enabled: commerceEnabled, cart } = useCart();
  const wishlistsEnabled = isPublicPluginEnabled("commerceWishlists", settings);

  const showDarkMode = headerConfig.darkModeToggle.enabled;
  const showCta = headerConfig.cta.enabled;
  const showUserMenu = headerConfig.userMenu.enabled;
  const guestDisplay = headerConfig.userMenu.guestDisplay;
  const count = cart?.itemCount ?? 0;

  return (
    <div data-slot="header-actions" className={cn("flex shrink-0 items-center gap-1", className)}>
      <HeaderSearchTrigger config={headerConfig.search} />
      {showCta && (
        <Link
          to={headerConfig.cta.url}
          className={buttonClasses(headerConfig.cta.style === "filled" ? "primary" : headerConfig.cta.style === "outline" ? "secondary" : "quiet", "sm", "hidden md:inline-flex")}
        >
          {headerConfig.cta.label}
        </Link>
      )}

      {showDarkMode && <ThemeToggle variant={headerConfig.darkModeToggle.variant} />}

      {showUserMenu && isLoaded && (
        <>
          {isSignedIn ? (
            <>
              <WebsiteNotificationBell />
              <UserMenu />
            </>
          ) : (
            guestDisplay !== "hidden" && (
              <div className="flex items-center gap-1">
                <Link to="/login" aria-label="Sign in" className={cn(buttonClasses("quiet", "sm", "px-2"), "gap-1.5")}>
                  <User className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Sign in</span>
                </Link>
                {guestDisplay === "login-register" && (
                  <Link to="/register" className={buttonClasses("secondary", "sm", "hidden sm:inline-flex")}>
                    Register
                  </Link>
                )}
              </div>
            )
          )}
        </>
      )}

      {commerceEnabled && (
        <>
          {wishlistsEnabled && isSignedIn && (
            <Link to={to("/wishlist")} className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Wishlist">
              <Heart className="size-4" aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex h-10 items-center gap-2 rounded-md px-2 text-foreground transition-colors hover:bg-muted"
            aria-label={`Cart${count ? `, ${count} items` : ""}`}
          >
            <span className="relative">
              <ShoppingCart className="size-5" aria-hidden="true" />
              {count > 0 && (
                <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-md bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </span>
            <span className="hidden flex-col items-start leading-none md:flex">
              <Label className="text-[10px]">Cart</Label>
              <span className="text-[13px] font-semibold tabular-nums">{formatMoney(cart?.subtotalAmount ?? 0, cart?.currencyCode ?? settings?.commerceConfig?.currencyCode ?? "USD")}</span>
            </span>
          </button>
          <Surface name="chrome.cartDrawer" data={{ open: cartOpen, onOpenChange: setCartOpen }} fallback={CoreCartDrawer} />
        </>
      )}
    </div>
  );
}

function DepartmentLink({ item, style }: { item: ResolvedMenuItem; style: HeaderConfig["navigation"]["style"] }) {
  return <MenuItemTarget item={item} separatorOrientation="vertical" className={cn("inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted", style === "pills" && "rounded-full border border-transparent hover:border-border", style === "underline" && "rounded-none border-b border-transparent hover:border-foreground hover:bg-transparent", item.cssClasses)} activeProps={{ className: "bg-muted text-primary", "aria-current": "page" }} />;
}

function MenuLink({ item, className, onNavigate }: { item: ResolvedMenuItem; className?: string; onNavigate?: () => void }) {
  return <MenuItemTarget item={item} className={className} onClick={onNavigate} />;
}

/** "All" mega dropdown: every department with its children, in columns. */
function AllDepartments({ items }: { items: ResolvedMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const groups = items.filter((item) => item.children.length > 0);
  const singles = items.filter((item) => item.children.length === 0);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger className="inline-flex h-8 items-center gap-1 rounded-md bg-muted px-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/70 aria-expanded:bg-primary aria-expanded:text-primary-foreground">
        <Menu className="size-4" aria-hidden="true" />
        All
        <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="start" sideOffset={6} className="isolate z-50 outline-hidden">
          <PopoverPrimitive.Popup
            aria-label="All departments"
            className="w-[min(960px,calc(100vw-2rem))] rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {groups.map((group) => (
                <div key={group.id} className="flex flex-col gap-1">
                  <MenuLink onNavigate={close} item={group} className="text-[13px] font-semibold text-foreground hover:text-primary" />
                  <ul role="list" className="flex flex-col">
                    {group.children
                      .filter((child) => !child.isOrphaned)
                      .map((child) => (
                        <li key={child.id}>
                          <MenuLink onNavigate={close} item={child} className="block py-1 text-[13px] text-muted-foreground hover:text-foreground" />
                          {child.children.length > 0 && (
                            <ul role="list" className="ml-3 border-l border-border pl-2">
                              {child.children
                                .filter((leaf) => !leaf.isOrphaned)
                                .map((leaf) => (
                                  <li key={leaf.id}>
                                    <MenuLink onNavigate={close} item={leaf} className="block py-0.5 text-xs text-muted-foreground hover:text-foreground" />
                                  </li>
                                ))}
                            </ul>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
              {singles.length > 0 && (
                <div className="flex flex-col gap-1">
                  <Label>More</Label>
                  <ul role="list" className="flex flex-col">
                    {singles.map((item) => (
                      <li key={item.id}>
                        <MenuLink onNavigate={close} item={item} className="block py-1 text-[13px] text-muted-foreground hover:text-foreground" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function TopBar({ config }: { config: HeaderConfig["topBar"] }) {
  return (
    <div className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
      <Container><HeaderTopBar config={config} /></Container>
    </div>
  );
}
