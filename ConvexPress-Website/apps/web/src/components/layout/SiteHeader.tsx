import { Mail, Menu, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import type { HeaderConfig, LayoutConfig, ResolvedMenu, SiteIdentity } from "@/lib/layout/types";

import { DesktopNav } from "./DesktopNav";
import { HeaderActions } from "./HeaderActions";
import { SearchOverlay } from "./SearchOverlay";
import { SiteBrand } from "./SiteBrand";

interface SiteHeaderProps {
  siteIdentity: SiteIdentity | undefined;
  menu: ResolvedMenu | undefined;
  layoutConfig?: LayoutConfig;
}

/**
 * Main site header containing logo/brand, primary navigation, search toggle, and user menu.
 * Renders dynamically based on header config from admin settings.
 * Falls back to standard layout when no config is stored.
 */
export function SiteHeader({ siteIdentity, menu, layoutConfig }: SiteHeaderProps) {
  const { isScrolled, toggleMobileNav } = useLayoutShell();
  const headerConfig = useHeaderConfig();

  const stickyHeader = layoutConfig?.stickyHeader !== false;
  const stickyMode = headerConfig.layout.sticky;
  const isSticky = stickyMode === "always" || (stickyMode === "scroll-up" && stickyHeader);
  const layoutStyle = headerConfig.layout.style;
  const heightClass = headerConfig.layout.height === "compact"
    ? "h-12 lg:h-12"
    : headerConfig.layout.height === "tall"
      ? "h-16 lg:h-20"
      : "h-14 lg:h-16";

  const backgroundClass = headerConfig.layout.background === "transparent"
    ? "bg-transparent"
    : headerConfig.layout.background === "glass"
      ? "bg-background/80 backdrop-blur-md"
      : "bg-background";

  const borderClass = headerConfig.layout.bottomBorder === "bold"
    ? "border-b-2 border-border"
    : headerConfig.layout.bottomBorder === "none"
      ? ""
      : headerConfig.layout.bottomBorder === "shadow"
        ? "shadow-sm"
        : "border-b border-border";

  return (
    <header
      data-slot="site-header"
      role="banner"
      className={cn(
        "z-40 w-full transition-shadow",
        backgroundClass,
        borderClass,
        isSticky && "sticky top-0",
        isScrolled && headerConfig.layout.background !== "glass" && "bg-background/95 shadow-sm backdrop-blur-sm",
      )}
    >
      {/* Top bar - show/hide based on config */}
      {headerConfig.topBar.enabled && (
        <TopBar config={headerConfig.topBar} />
      )}

      {/* Main header bar */}
      <div className={cn(
        "mx-auto flex items-center justify-between px-4 md:px-6 lg:px-8",
        heightClass,
      )}>
        {layoutStyle === "centered" ? (
          <CenteredLayout
            siteIdentity={siteIdentity}
            menu={menu}
            headerConfig={headerConfig}
            toggleMobileNav={toggleMobileNav}
          />
        ) : layoutStyle === "split" ? (
          <SplitLayout
            siteIdentity={siteIdentity}
            menu={menu}
            headerConfig={headerConfig}
            toggleMobileNav={toggleMobileNav}
          />
        ) : (
          <StandardLayout
            siteIdentity={siteIdentity}
            menu={menu}
            headerConfig={headerConfig}
            toggleMobileNav={toggleMobileNav}
          />
        )}
      </div>

      {/* Search overlay - renders below header bar when open */}
      {headerConfig.search.enabled && <SearchOverlay />}
    </header>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────

interface TopBarProps {
  config: HeaderConfig["topBar"];
}

function TopBar({ config }: TopBarProps) {
  return (
    <div className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
      <div className="mx-auto flex items-center justify-between px-4 py-1.5 md:px-6 lg:px-8">
        <TopBarContent type={config.leftContent} config={config} />
        <TopBarContent type={config.rightContent} config={config} />
      </div>
    </div>
  );
}

interface TopBarContentProps {
  type: HeaderConfig["topBar"]["leftContent"];
  config: HeaderConfig["topBar"];
}

function TopBarContent({ type, config }: TopBarContentProps) {
  if (type === "none") return <div />;

  if (type === "contact") {
    return (
      <div className="flex items-center gap-4">
        {config.email && (
          <a href={`mailto:${config.email}`} className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Mail className="size-3" aria-hidden="true" />
            <span>{config.email}</span>
          </a>
        )}
        {config.phone && (
          <a href={`tel:${config.phone}`} className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <Phone className="size-3" aria-hidden="true" />
            <span>{config.phone}</span>
          </a>
        )}
        {!config.email && !config.phone && <div />}
      </div>
    );
  }

  if (type === "announcement" && config.announcementText) {
    return (
      <p className="truncate">{config.announcementText}</p>
    );
  }

  // "social" type - rendered via the SocialLinks component from footer,
  // but for now we just render an empty placeholder so it doesn't break
  return <div />;
}

// ─── Standard Layout ────────────────────────────────────────────────────────

interface LayoutInnerProps {
  siteIdentity: SiteIdentity | undefined;
  menu: ResolvedMenu | undefined;
  headerConfig: HeaderConfig;
  toggleMobileNav: () => void;
}

function StandardLayout({ siteIdentity, menu, headerConfig, toggleMobileNav }: LayoutInnerProps) {
  return (
    <>
      {/* Left: Hamburger (mobile) + Brand */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleMobileNav}
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <SiteBrand siteIdentity={siteIdentity} />
      </div>

      {/* Center: Desktop navigation */}
      {headerConfig.navigation.enabled && (
        <DesktopNav menu={menu} className="mx-6 flex-1" />
      )}

      {/* Right: Actions */}
      <HeaderActions headerConfig={headerConfig} />
    </>
  );
}

// ─── Centered Layout ────────────────────────────────────────────────────────

function CenteredLayout({ siteIdentity, menu, headerConfig, toggleMobileNav }: LayoutInnerProps) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      {/* Top row: hamburger left, brand center, actions right */}
      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          onClick={toggleMobileNav}
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <SiteBrand siteIdentity={siteIdentity} />
        <HeaderActions headerConfig={headerConfig} />
      </div>
      {/* Bottom row: navigation centered */}
      {headerConfig.navigation.enabled && (
        <DesktopNav menu={menu} className="justify-center" />
      )}
    </div>
  );
}

// ─── Split Layout ───────────────────────────────────────────────────────────

function SplitLayout({ siteIdentity, menu, headerConfig, toggleMobileNav }: LayoutInnerProps) {
  return (
    <>
      {/* Left: Nav */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleMobileNav}
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        {headerConfig.navigation.enabled && (
          <DesktopNav menu={menu} />
        )}
      </div>

      {/* Center: Brand */}
      <SiteBrand siteIdentity={siteIdentity} />

      {/* Right: Actions */}
      <HeaderActions headerConfig={headerConfig} />
    </>
  );
}
