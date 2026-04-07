import type { LucideIcon } from "lucide-react";

/**
 * A resolved menu item from the Menu System, ready for rendering.
 * This is what the getMenuForLocation query returns (flattened or tree-structured).
 */
export interface ResolvedMenuItem {
  /** Unique item ID from Convex */
  id: string;
  /** Display label */
  label: string;
  /** Resolved URL (absolute or relative path) */
  url: string;
  /** Link target (_blank, _self, etc.) */
  target?: string;
  /** Link rel attribute (nofollow, etc.) */
  rel?: string;
  /** CSS classes from admin configuration */
  cssClasses?: string;
  /** Item type (page, post, category, tag, custom) */
  type: "page" | "post" | "category" | "tag" | "custom";
  /** Nesting depth (0 = top-level) */
  depth: number;
  /** Child menu items (for tree rendering) */
  children: ResolvedMenuItem[];
  /** Whether the item's linked content was deleted (should not render on website) */
  isOrphaned?: boolean;
}

/**
 * A resolved menu from the Menu System.
 */
export interface ResolvedMenu {
  /** Menu ID */
  id: string;
  /** Menu name */
  name: string;
  /** Menu slug */
  slug: string;
  /** Ordered, hierarchical menu items */
  items: ResolvedMenuItem[];
}

/**
 * Site identity settings consumed by the header.
 */
export interface SiteIdentity {
  /** Site title (e.g., "ConvexPress") */
  title: string;
  /** Site tagline / description */
  tagline: string;
  /** Logo URL from Theme/Settings system */
  logoUrl?: string;
  /** Logo alt text */
  logoAlt?: string;
  /** Whether to display site title text alongside logo */
  showTitleWithLogo?: boolean;
}

/**
 * Layout configuration derived from the active theme.
 */
export interface LayoutConfig {
  /** Content area max width */
  contentMaxWidth: "sm" | "md" | "lg" | "xl" | "full";
  /** Sidebar position for the current content type */
  sidebarPosition: "left" | "right" | "none";
  /** Header style variant */
  headerStyle: "default" | "centered" | "split";
  /** Whether sticky header is enabled */
  stickyHeader: boolean;
}

// ─── Header Config (from admin settings) ───────────────────────────────────

export interface HeaderConfig {
  layout: {
    style: "standard" | "centered" | "split";
    sticky: "always" | "scroll-up" | "none";
    background: "solid" | "transparent" | "glass";
    height: "compact" | "normal" | "tall";
    bottomBorder: "subtle" | "bold" | "none" | "shadow";
  };
  topBar: {
    enabled: boolean;
    leftContent: "contact" | "announcement" | "social" | "none";
    rightContent: "contact" | "announcement" | "social" | "none";
    email: string;
    phone: string;
    announcementText: string;
  };
  logo: {
    enabled: boolean;
    showImage: boolean;
    showTitle: boolean;
    showTagline: boolean;
    size: "small" | "medium" | "large";
  };
  navigation: {
    enabled: boolean;
    menuSource: "primary" | "secondary" | "custom";
    style: "inline" | "pills" | "underline";
    dropdownStyle: "flyout" | "mega";
  };
  search: {
    enabled: boolean;
    variant: "inline" | "icon" | "expandable";
    placeholder: string;
  };
  cta: {
    enabled: boolean;
    label: string;
    url: string;
    style: "filled" | "outline" | "ghost";
  };
  userMenu: {
    enabled: boolean;
    guestDisplay: "login-register" | "login-only" | "hidden";
    loggedInDisplay: "avatar-dropdown" | "name-dropdown" | "avatar-only";
    dropdownPreset: "dashboard-profile-logout" | "profile-settings-logout" | "custom";
  };
  darkModeToggle: {
    enabled: boolean;
    variant: "icon" | "switch";
  };
  mobileMenu: {
    variant: "drawer" | "fullscreen" | "dropdown";
    drawerSide: "left" | "right";
  };
}

// ─── Footer Config (from admin settings) ───────────────────────────────────

export interface FooterConfig {
  layout: {
    columns: "1" | "2" | "3" | "4" | "centered" | "minimal";
    background: "dark" | "match-site" | "accent" | "image";
    backgroundImageId: string | null;
    topBorder: "subtle" | "bold" | "accent" | "none";
    padding: "compact" | "normal" | "spacious";
  };
  branding: {
    enabled: boolean;
    showLogo: boolean;
    showDescription: boolean;
    description: string;
    showSocial: boolean;
  };
  navColumns: {
    enabled: boolean;
    columns: Array<{
      heading: string;
      menuSource: "footer-1" | "footer-2" | "footer-3" | "auto-pages" | "custom";
    }>;
  };
  newsletter: {
    enabled: boolean;
    heading: string;
    subtext: string;
    buttonText: string;
  };
  contactInfo: {
    enabled: boolean;
    address: string;
    phone: string;
    email: string;
  };
  bottomBar: {
    enabled: boolean;
    copyrightText: string;
    legalLinks: "privacy-terms" | "privacy-only" | "custom" | "none";
    poweredBy: boolean;
  };
}

/**
 * Breadcrumb segment for the breadcrumb trail.
 */
export interface BreadcrumbSegment {
  /** Display label */
  label: string;
  /** Link path (last segment has no link) */
  to?: string;
}

/**
 * Layout shell state managed by context.
 */
export interface LayoutShellState {
  /** Whether mobile navigation is open */
  mobileNavOpen: boolean;
  /** Whether search overlay is open */
  searchOpen: boolean;
  /** Whether the user has scrolled past the header (for sticky behavior) */
  isScrolled: boolean;
  /** Whether back-to-top button should be visible */
  showBackToTop: boolean;
}

/**
 * Layout shell actions dispatched via context.
 */
export interface LayoutShellActions {
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
  toggleSearch: () => void;
  closeSearch: () => void;
}

/**
 * Admin bar items for logged-in administrators.
 */
export interface AdminBarItem {
  /** Unique item ID */
  id: string;
  /** Display label */
  label: string;
  /** Link URL (admin or website) */
  href: string;
  /** Lucide icon component */
  icon?: LucideIcon;
  /** Open in new tab */
  external?: boolean;
}

/**
 * Dashboard navigation item.
 */
export interface DashboardNavItem {
  /** Unique item ID */
  id: string;
  /** Display label */
  label: string;
  /** Route path */
  to: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Whether to match exact path only */
  exact?: boolean;
}
