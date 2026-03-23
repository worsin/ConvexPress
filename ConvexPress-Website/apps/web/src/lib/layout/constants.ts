import {
  Bell,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  User,
} from "lucide-react";

import type { DashboardNavItem, LayoutConfig } from "./types";

/**
 * Layout dimensions in pixels.
 */
export const LAYOUT_DIMENSIONS = {
  /** Header height on desktop */
  headerDesktop: 64,
  /** Header height on mobile */
  headerMobile: 56,
  /** Admin bar height */
  adminBar: 32,
  /** Mobile nav panel width */
  mobileNavWidth: 288,
  /** Sidebar width (desktop) */
  sidebarWidth: 256,
  /** Sidebar width (large desktop) */
  sidebarWidthLg: 288,
  /** Dashboard sidebar width */
  dashboardSidebarWidth: 224,
  /** Back-to-top scroll threshold */
  backToTopThreshold: 600,
  /** Scroll threshold for sticky header shadow */
  scrollThreshold: 10,
} as const;

/**
 * Z-index stack for layout elements.
 */
export const Z_INDEX = {
  backToTop: 30,
  header: 40,
  searchOverlay: 40,
  dropdown: 50,
  mobileNavBackdrop: 50,
  mobileNavPanel: 50,
  adminBar: 50,
  skipToContent: 100,
} as const;

/**
 * Max-width map for content area.
 */
export const MAX_WIDTH_MAP: Record<LayoutConfig["contentMaxWidth"], string> = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
  full: "max-w-full",
};

/**
 * Default layout configuration when theme data is not available.
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  contentMaxWidth: "lg",
  sidebarPosition: "right",
  sidebarWidgetArea: "sidebar-1",
  headerStyle: "default",
  footerColumns: 3,
  stickyHeader: true,
};

/**
 * Navigation items for the user dashboard sidebar.
 */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    id: "posts",
    label: "My Posts",
    to: "/dashboard/posts",
    icon: FileText,
  },
  {
    id: "profile",
    label: "Profile",
    to: "/dashboard/profile",
    icon: User,
  },
  {
    id: "comments",
    label: "Comments",
    to: "/dashboard/comments",
    icon: MessageSquare,
  },
  {
    id: "notifications",
    label: "Notifications",
    to: "/dashboard/notifications",
    icon: Bell,
  },
  {
    id: "security",
    label: "Security",
    to: "/dashboard/security",
    icon: Shield,
  },
  {
    id: "settings",
    label: "Settings",
    to: "/dashboard/settings",
    icon: Settings,
  },
];

/**
 * Dropdown hover timing.
 */
export const DROPDOWN_TIMING = {
  /** Delay before dropdown opens on hover (ms) */
  openDelay: 150,
  /** Delay before dropdown closes on mouse leave (ms) */
  closeDelay: 300,
} as const;

/**
 * Route segment label map for breadcrumb generation.
 */
export const ROUTE_LABEL_MAP: Record<string, string> = {
  blog: "Blog",
  page: "Pages",
  category: "Category",
  tag: "Tag",
  author: "Author",
  search: "Search",
  archive: "Archive",
  dashboard: "Dashboard",
  profile: "Profile",
  settings: "Settings",
  posts: "My Posts",
  comments: "My Comments",
  notifications: "Notifications",
  security: "Security",
};
