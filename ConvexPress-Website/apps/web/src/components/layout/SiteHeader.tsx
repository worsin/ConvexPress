import { HeaderSearchInline, HeaderSearchExpansion } from "@/components/layout/HeaderSearch";
import { useStickyHeaderOffset } from "@/hooks/layout/useStickyHeaderOffset";
import { Mail, Menu, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useHeaderConfig } from "@/hooks/layout/useHeaderConfig";
import type { HeaderConfig, LayoutConfig, ResolvedMenu, SiteIdentity } from "@/lib/layout/types";

import CoreSearchOverlay from "@/templates/packs/core/surfaces/chrome.searchOverlay";
import { Surface } from "@/templates/sdk/Surface";

import { DesktopNav } from "./DesktopNav";
import { HeaderActions } from "./HeaderActions";
import { SiteBrand } from "./SiteBrand";
import { HeaderMainRow } from "./HeaderMainRow";
import { SocialLinks } from "./SocialLinks";

interface SiteHeaderProps {
  siteIdentity: SiteIdentity | undefined;
  menu: ResolvedMenu | undefined;
  layoutConfig?: LayoutConfig;
  /** Header settings; defaults to the site's stored header config. */
  headerConfig?: HeaderConfig;
}

/**
 * Main site header containing logo/brand, primary navigation, search toggle, and user menu.
 * Renders dynamically based on header config from admin settings.
 * Falls back to standard layout when no config is stored.
 */
export function SiteHeader({ siteIdentity, menu, layoutConfig, headerConfig: headerConfigProp }: SiteHeaderProps) {
  const { toggleMobileNav, searchOpen, closeSearch } = useLayoutShell();
  const storedHeaderConfig = useHeaderConfig();
  const headerConfig = headerConfigProp ?? storedHeaderConfig;

  const stickyHeader = layoutConfig?.stickyHeader !== false;
  const stickyMode = headerConfig.layout.sticky;
  const isSticky = stickyMode === "always" || (stickyMode === "scroll-up" && stickyHeader);
  const headerRef = useStickyHeaderOffset(isSticky, stickyMode);
  const layoutStyle = headerConfig.layout.style;
  const heightClass = headerConfig.layout.height === "compact"
    ? "min-h-12 lg:min-h-12"
    : headerConfig.layout.height === "tall"
      ? "min-h-16 lg:min-h-20"
      : "min-h-14 lg:min-h-16";

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
      ref={headerRef}
      data-slot="site-header" data-customize="header.layout.sticky"
      role="banner"
      className={cn(
        "z-40 w-full transition-shadow",
        backgroundClass,
        borderClass,
        isSticky && "sticky top-0",
      )}
    >
      {/* Top bar - show/hide based on config */}
      {headerConfig.topBar.enabled && (
        <TopBar config={headerConfig.topBar} />
      )}

      <div className="mx-auto px-4 md:px-6 lg:px-8">
        <HeaderMainRow
          style={layoutStyle}
          heightClass={heightClass}
          brand={<SiteBrand siteIdentity={siteIdentity} logo={headerConfig.logo} />}
          mobileToggle={
            <button
              type="button"
              onClick={toggleMobileNav}
              className="flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          }
          navigation={headerConfig.navigation.enabled && (
            <DesktopNav menu={menu} linkStyle={headerConfig.navigation.style} dropdownStyle={headerConfig.navigation.dropdownStyle} />
          )}
          search={headerConfig.search.enabled && headerConfig.search.variant === "inline" && <HeaderSearchInline config={headerConfig.search} pack="core" />}
          actions={<HeaderActions headerConfig={headerConfig} />}
        />
        <HeaderSearchInline config={headerConfig.search} pack="core" mobile />
        <HeaderSearchExpansion config={headerConfig.search} pack="core" />
      </div>

      {/* Search overlay - renders below header bar when open */}
      {headerConfig.search.enabled && headerConfig.search.variant === "icon" && (
        <Surface
          name="chrome.searchOverlay"
          data={{ open: searchOpen, onClose: closeSearch, placeholder: headerConfig.search.placeholder }}
          fallback={CoreSearchOverlay}
        />
      )}
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
      <div className="mx-auto flex min-w-0 items-center justify-between gap-3 px-4 py-1.5 md:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <TopBarContent type={config.leftContent} config={config} />
        </div>
        <div className="flex shrink-0 justify-end">
          <TopBarContent type={config.rightContent} config={config} />
        </div>
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
      <div className="flex min-w-0 items-center justify-end gap-3 md:gap-4">
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
        {!config.email && !config.phone && <div />}
      </div>
    );
  }

  if (type === "announcement" && config.announcementText) {
    return (
      <p className="min-w-0 truncate">{config.announcementText}</p>
    );
  }

  if (type === "social") {
    return <SocialLinks iconSize="sm" />;
  }

  return <div />;
}
