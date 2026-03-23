import type { LucideIcon } from "lucide-react";

/**
 * Represents a single navigation item in the admin sidebar.
 */
export interface AdminNavItem {
  /** Unique identifier for the nav item */
  id: string;
  /** Display label (matches WordPress naming: "All Posts", "Add New", etc.) */
  label: string;
  /** TanStack Router path (e.g., "/posts") */
  to: string;
  /** Lucide icon component (only used on parent/top-level items) */
  icon?: LucideIcon;
  /** Capability required to see this item (e.g., "edit_posts") */
  capability?: string;
  /** Badge count (e.g., pending comments count) */
  badge?: number;
  /** Whether this is the "Add New" action link (styled differently) */
  isAddNew?: boolean;
  /** Match exact path only (default: false, matches prefix) */
  exact?: boolean;
}

/**
 * Represents a collapsible section in the admin sidebar.
 * A section has a parent item and optional children.
 */
export interface AdminNavSection {
  /** Unique identifier for the section */
  id: string;
  /** Display label for the parent item (e.g., "Posts", "Media", "Settings") */
  label: string;
  /** TanStack Router path for the parent item */
  to: string;
  /** Lucide icon for the section */
  icon: LucideIcon;
  /** Capability required to see this section */
  capability?: string;
  /** Badge count on the parent item */
  badge?: number;
  /** Child navigation items */
  children?: AdminNavItem[];
  /** Whether section starts expanded (default: auto based on active route) */
  defaultExpanded?: boolean;
  /** Section separator - renders a visual divider before this section */
  separator?: boolean;
}

/**
 * Configuration for Screen Options on a given admin page.
 */
export interface ScreenOptionsConfig {
  /** Columns that can be toggled (for list table pages) */
  columns?: ScreenOptionsColumn[];
  /** Items per page selector */
  perPage?: {
    /** Current value */
    value: number;
    /** Available options */
    options: number[];
    /** Label text */
    label?: string;
  };
  /** Additional custom options */
  custom?: ScreenOptionsCustomField[];
}

export interface ScreenOptionsColumn {
  /** Column identifier */
  id: string;
  /** Column display label */
  label: string;
  /** Whether the column is currently visible */
  visible: boolean;
}

export interface ScreenOptionsCustomField {
  /** Field identifier */
  id: string;
  /** Field display label */
  label: string;
  /** Field type */
  type: "checkbox" | "number" | "select";
  /** Current value */
  value: unknown;
  /** Options for select type */
  options?: Array<{ label: string; value: string | number }>;
}

/**
 * A single breadcrumb segment.
 */
export interface BreadcrumbSegment {
  /** Display label */
  label: string;
  /** Optional link path (last segment has no link) */
  to?: string;
}

/**
 * Admin shell state managed by context.
 */
export interface AdminShellState {
  /** Whether sidebar is collapsed to icon-only mode */
  sidebarCollapsed: boolean;
  /** Whether mobile sidebar overlay is open */
  mobileSidebarOpen: boolean;
  /** Expanded section IDs in sidebar */
  expandedSections: Set<string>;
  /** Screen options for the current page */
  screenOptions: ScreenOptionsConfig | null;
}

/**
 * Admin shell actions dispatched via context.
 */
export interface AdminShellActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleSection: (sectionId: string) => void;
  expandSection: (sectionId: string) => void;
  setScreenOptions: (config: ScreenOptionsConfig | null) => void;
}

/**
 * User data displayed in the admin bar user menu.
 */
export interface AdminBarUser {
  /** User ID */
  id: string;
  /** Display name */
  displayName: string;
  /** User email */
  email: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** User role name */
  role: string;
}
