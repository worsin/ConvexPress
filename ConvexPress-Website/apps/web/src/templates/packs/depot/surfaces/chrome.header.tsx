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
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Heart, Mail, Menu, Phone, Search, ShoppingCart, User } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SocialLinks } from "@/components/layout/SocialLinks";
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
  const { isScrolled, toggleMobileNav } = useLayoutShell();

  const stickyHeader = layoutConfig?.stickyHeader !== false;
  const stickyMode = headerConfig.layout.sticky;
  const isSticky = stickyMode === "always" || (stickyMode === "scroll-up" && stickyHeader);
  const headerRef = useStickyHeaderOffset(isSticky);
  const backgroundClass =
    headerConfig.layout.background === "transparent" ? "bg-transparent" : headerConfig.layout.background === "glass" ? "bg-background/85 backdrop-blur-md" : "bg-background";
  const borderClass =
    headerConfig.layout.bottomBorder === "bold"
      ? "border-b-2 border-border"
      : headerConfig.layout.bottomBorder === "none"
        ? ""
        : headerConfig.layout.bottomBorder === "shadow"
          ? "shadow-sm"
          : "border-b border-border";

  const visibleItems = menu?.items.filter((item) => !item.isOrphaned) ?? [];
  const showNav = headerConfig.navigation.enabled && visibleItems.length > 0;
  const showSearch = headerConfig.search.enabled;

  return (
    <header
      ref={headerRef}
      data-slot="site-header" data-customize="header.layout.sticky"
      data-pack="depot"
      role="banner"
      className={cn("z-40 w-full transition-shadow", backgroundClass, borderClass, isSticky && "sticky top-0", isScrolled && headerConfig.layout.background !== "glass" && "bg-background/95 shadow-sm backdrop-blur-sm")}
    >
      {headerConfig.topBar.enabled && <TopBar config={headerConfig.topBar} />}

      {/* Row one */}
      <Container className="flex h-14 items-center gap-3 md:gap-4">
        <button
          type="button"
          onClick={toggleMobileNav}
          className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <Wordmark siteIdentity={siteIdentity} logo={headerConfig.logo} />
        {showSearch && <SearchBar placeholder={headerConfig.search.placeholder} className="hidden min-w-0 flex-1 md:flex" />}
        <HeaderCluster headerConfig={headerConfig} className="ml-auto" />
      </Container>

      {/* Mobile search row: the search bar stays on phones */}
      {showSearch && (
        <Container className="pb-2 md:hidden">
          <SearchBar placeholder={headerConfig.search.placeholder} className="flex" />
        </Container>
      )}

      {/* Row two: departments */}
      {showNav && (
        <nav aria-label="Primary navigation" className="hidden border-t border-border lg:block">
          <Container className="flex h-10 items-center gap-1">
            {visibleItems.some((item) => item.children.length > 0) && <AllDepartments items={visibleItems} />}
            <ul role="list" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {visibleItems.map((item) => (
                <li key={item.id} className="shrink-0">
                  <DepartmentLink item={item} />
                </li>
              ))}
            </ul>
          </Container>
        </nav>
      )}
    </header>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Wordmark({ siteIdentity, logo }: { siteIdentity: SiteIdentity | undefined; logo: HeaderConfig["logo"] }) {
  if (!siteIdentity) return <div className="h-5 w-24 animate-pulse rounded-md bg-muted" aria-hidden="true" />;
  const showImage = logo.enabled && logo.showImage && !!siteIdentity.logoUrl;
  const showTitle = !showImage || (logo.showTitle && siteIdentity.showTitleWithLogo !== false);
  return (
    <Link to="/" data-slot="site-brand" data-customize="header.logo.showTitle" className="flex min-w-0 items-center gap-2 text-foreground no-underline md:max-w-[35%]">
      {showImage && <img src={siteIdentity.logoUrl} alt={siteIdentity.logoAlt || siteIdentity.title} className="h-8 w-auto min-w-0 max-w-32 object-contain" width={32} height={32} />}
      {showTitle && <span className="min-w-0 truncate text-base font-bold tracking-tight">{siteIdentity.title}</span>}
      {logo.showTagline && siteIdentity.tagline ? <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground xl:inline">{siteIdentity.tagline}</span> : null}
    </Link>
  );
}

function SearchBar({ placeholder, className }: { placeholder: string; className?: string }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const [draft, setDraft] = useState("");
  // Shops search the catalog first; the site-wide search stays a click away (same as Core's overlay).
  const target = settings?.plugins?.commerceEnabled === true ? "/products" : "/search";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = draft.trim();
    if (!q) return;
    void navigate({ to: target, search: { q } } as any);
  };

  return (
    <form role="search" onSubmit={submit} className={cn("items-center", className)}>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          name="q"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder || "Search…"}
          autoComplete="off"
          className="h-10 w-full rounded-l-md border border-r-0 border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <button type="submit" className={buttonClasses("primary", "md", "rounded-l-none px-3")} aria-label="Search">
        <Search className="size-4 md:hidden" aria-hidden="true" />
        <span className="hidden md:inline">Search</span>
      </button>
    </form>
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
      {showCta && (
        <Link
          to={headerConfig.cta.url}
          className={buttonClasses(headerConfig.cta.style === "filled" ? "primary" : headerConfig.cta.style === "outline" ? "secondary" : "quiet", "sm", "hidden md:inline-flex")}
        >
          {headerConfig.cta.label}
        </Link>
      )}

      {showDarkMode && <ThemeToggle />}

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

function isExternal(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

function DepartmentLink({ item }: { item: ResolvedMenuItem }) {
  const className = cn("inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted", item.cssClasses);
  const linkProps = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
  if (isExternal(item.url)) {
    return (
      <a href={item.url} className={className} {...linkProps}>
        {item.label}
      </a>
    );
  }
  return (
    <Link to={item.url} className={className} activeProps={{ className: "bg-muted text-primary", "aria-current": "page" as const }} {...linkProps}>
      {item.label}
    </Link>
  );
}

function MenuLink({ item, className }: { item: ResolvedMenuItem; className?: string }) {
  const linkProps = { ...(item.target ? { target: item.target } : {}), ...(item.rel ? { rel: item.rel } : {}) };
  if (isExternal(item.url)) {
    return (
      <a href={item.url} className={className} {...linkProps}>
        {item.label}
      </a>
    );
  }
  return (
    <Link to={item.url} className={className} {...linkProps}>
      {item.label}
    </Link>
  );
}

/** "All" mega dropdown: every department with its children, in columns. */
function AllDepartments({ items }: { items: ResolvedMenuItem[] }) {
  const groups = items.filter((item) => item.children.length > 0);
  const singles = items.filter((item) => item.children.length === 0);
  return (
    <PopoverPrimitive.Root>
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
                  <MenuLink item={group} className="text-[13px] font-semibold text-foreground hover:text-primary" />
                  <ul role="list" className="flex flex-col">
                    {group.children
                      .filter((child) => !child.isOrphaned)
                      .map((child) => (
                        <li key={child.id}>
                          <MenuLink item={child} className="block py-1 text-[13px] text-muted-foreground hover:text-foreground" />
                          {child.children.length > 0 && (
                            <ul role="list" className="ml-3 border-l border-border pl-2">
                              {child.children
                                .filter((leaf) => !leaf.isOrphaned)
                                .map((leaf) => (
                                  <li key={leaf.id}>
                                    <MenuLink item={leaf} className="block py-0.5 text-xs text-muted-foreground hover:text-foreground" />
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
                        <MenuLink item={item} className="block py-1 text-[13px] text-muted-foreground hover:text-foreground" />
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
      <Container className="flex min-w-0 items-center justify-between gap-3 py-1.5">
        <div className="min-w-0 flex-1">
          <TopBarContent type={config.leftContent} config={config} />
        </div>
        <div className="flex shrink-0 justify-end">
          <TopBarContent type={config.rightContent} config={config} />
        </div>
      </Container>
    </div>
  );
}

function TopBarContent({ type, config }: { type: HeaderConfig["topBar"]["leftContent"]; config: HeaderConfig["topBar"] }) {
  if (type === "contact") {
    return (
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        {config.email && (
          <a href={`mailto:${config.email}`} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors hover:text-foreground">
            <Mail className="size-3" aria-hidden="true" />
            <span>{config.email}</span>
          </a>
        )}
        {config.phone && (
          <a href={`tel:${config.phone}`} className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors hover:text-foreground md:flex">
            <Phone className="size-3" aria-hidden="true" />
            <span>{config.phone}</span>
          </a>
        )}
      </div>
    );
  }
  if (type === "announcement" && config.announcementText) return <p className="min-w-0 truncate font-medium text-foreground">{config.announcementText}</p>;
  if (type === "social") return <SocialLinks iconSize="sm" />;
  return <div />;
}
