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
  /** Site title (e.g., "SmithHarper") */
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
  /** Sidebar widget area slug */
  sidebarWidgetArea: string;
  /** Header style variant */
  headerStyle: "default" | "centered" | "split";
  /** Footer widget area column count */
  footerColumns: 1 | 2 | 3 | 4;
  /** Whether sticky header is enabled */
  stickyHeader: boolean;
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
