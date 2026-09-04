import {
  BadgeCheck,
  Bell,
  Download,
  FileText,
  GraduationCap,
  Heart,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  PackageOpen,
  Repeat,
  Settings,
  Shield,
  ShoppingBag,
  Star,
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
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-[1536px]",
  full: "max-w-none",
};

/**
 * Default layout configuration when theme data is not available.
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  contentMaxWidth: "xl",
  sidebarPosition: "right",
  headerStyle: "default",
  stickyHeader: true,
};

/**
 * Core navigation items for the user dashboard (registry ids, legacy
 * `/dashboard` paths). Ordered like the dashboard registry groups: overview,
 * activity, learning, account. Commerce and membership pages live in
 * DASHBOARD_EXTENSION_NAV_ITEMS; `buildDashboardNavItems()` in
 * lib/layout/dashboardNav.ts merges both and applies the plugin/capability
 * gates.
 */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    id: "home",
    label: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    iconName: "layout-dashboard",
    exact: true,
  },
  {
    id: "posts",
    label: "My Posts",
    to: "/dashboard/posts",
    icon: FileText,
    iconName: "file-text",
    capability: "edit_posts",
  },
  {
    id: "comments",
    label: "Comments",
    to: "/dashboard/comments",
    icon: MessageSquare,
    iconName: "message-square",
  },
  {
    id: "notifications",
    label: "Notifications",
    to: "/dashboard/notifications",
    icon: Bell,
    iconName: "bell",
    badge: "notifications.unread",
  },
  {
    id: "courses",
    label: "Courses",
    to: "/dashboard/courses",
    icon: GraduationCap,
    iconName: "graduation-cap",
    plugin: "lms",
    badge: "courses.inProgress",
  },
  {
    id: "profile",
    label: "Profile",
    to: "/dashboard/profile",
    icon: User,
    iconName: "user",
  },
  {
    id: "security",
    label: "Security",
    to: "/dashboard/security",
    icon: Shield,
    iconName: "shield-check",
  },
  {
    id: "settings",
    label: "Settings",
    to: "/dashboard/settings",
    icon: Settings,
    iconName: "settings",
  },
];

/**
 * Commerce, subscription and membership dashboard pages. Each is gated by the
 * public plugin flag that owns it; `buildDashboardNavItems()` inserts the
 * block between the activity items and Courses.
 */
export const DASHBOARD_EXTENSION_NAV_ITEMS: DashboardNavItem[] = [
  {
    id: "orders",
    label: "Orders",
    to: "/dashboard/orders",
    icon: ShoppingBag,
    iconName: "shopping-bag",
    plugin: "commerce",
    badge: "orders.active",
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    to: "/dashboard/subscriptions",
    icon: Repeat,
    iconName: "repeat",
    plugin: "commerceSubscriptions",
  },
  {
    id: "returns",
    label: "Returns",
    to: "/dashboard/returns",
    icon: PackageOpen,
    iconName: "package-open",
    plugin: "commerceReturns",
  },
  {
    id: "downloads",
    label: "Downloads",
    to: "/dashboard/downloads",
    icon: Download,
    iconName: "download",
    plugin: "commerceDigital",
  },
  {
    id: "wishlist",
    label: "Wishlist",
    to: "/dashboard/wishlist",
    icon: Heart,
    iconName: "heart",
    plugin: "commerceWishlists",
  },
  {
    id: "reviews",
    label: "My Reviews",
    to: "/dashboard/reviews",
    icon: Star,
    iconName: "star",
    plugin: "commerceReviews",
  },
  {
    id: "addresses",
    label: "Addresses",
    to: "/dashboard/addresses",
    icon: MapPin,
    iconName: "map-pin",
    plugin: "commerce",
  },
  {
    id: "membership",
    label: "Membership",
    to: "/dashboard/membership",
    icon: BadgeCheck,
    iconName: "badge-check",
    plugin: "membership",
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
  courses: "Courses",
  comments: "My Comments",
  notifications: "Notifications",
  security: "Security",
  orders: "Orders",
  returns: "Returns",
  subscriptions: "Subscriptions",
  downloads: "Downloads",
  reviews: "My Reviews",
  wishlist: "Wishlist",
  addresses: "Addresses",
  membership: "Membership",
  tickets: "Support tickets",
  help: "Help center",
};
