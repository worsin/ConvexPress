# Admin Shell & Navigation UI - Expert Knowledge Document

**System:** Admin Shell & Navigation UI
**Status:** Implementation Ready
**Priority:** P0 - Critical (everything in admin renders inside this shell)
**Category:** Admin UI
**Layer:** Frontend Only (consumes Convex queries, never defines its own)
**WordPress Equivalent:** `wp-admin/admin-header.php`, `wp-admin/admin-footer.php`, `wp-admin/menu-header.php`, `wp-admin/includes/admin-bar.php`, admin page wrapper, screen options dropdown
**Last Analyzed:** 2026-02-09
**Airtable Expert Record:** `recwBSkkPI02m3a2e`

---

## Quick Reference

### What This System Does

The Admin Shell & Navigation UI is the outermost layout framework wrapping every `/admin/*` route in the ConvexPress admin panel. It provides the left sidebar navigation (WordPress-style collapsible sections), the top admin bar (site title, notifications, user menu), responsive shell behavior (sidebar collapse), screen options dropdown, breadcrumb trail, admin footer, loading states, and page transitions. Every admin page renders inside this shell. Without it, there is no admin interface.

This is a **frontend-only** system. It consumes Convex queries (for user data, notification counts, site settings, menu structure) but NEVER defines its own Convex functions. All backend logic lives in the respective system experts (Menu System, Site Notification System, Auth System, Settings System, Role & Capability System).

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Admin Shell** | The `_admin.tsx` TanStack Router layout route that provides sidebar + topbar + content area |
| **Sidebar** | Left-side vertical navigation with collapsible sections matching WordPress admin menu |
| **Admin Bar** | Top horizontal bar with site name link, notification bell, and user menu |
| **Sidebar Sections** | Groups of nav items under a parent (e.g., Posts section with All Posts, Add New, Categories, Tags) |
| **Collapsed Sidebar** | Sidebar reduces to icon-only mode on tablet, persisted in localStorage |
| **Mobile Overlay** | Sidebar becomes a slide-over overlay on small screens |
| **Screen Options** | Per-page dropdown panel at top of content area for column visibility, items per page |
| **Breadcrumbs** | Route-based breadcrumb trail showing navigation hierarchy |
| **Active State** | Current route highlighted in sidebar, parent section auto-expanded |
| **Capability Gating** | Sidebar items only render if the user has the required capability |
| **Pending Count Badges** | Numeric badges on nav items (e.g., Comments pending count) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Sidebar** | PHP-rendered `<div id="adminmenuwrap">`, hardcoded menu structure in `menu.php` | React component tree, declarative nav config, capability-filtered |
| **Admin Bar** | PHP-rendered `<div id="wpadminbar">` with `WP_Admin_Bar` class | React `AdminBar` component with the auth system user data |
| **Reactivity** | Full page reload on navigation | SPA with TanStack Router, instant page transitions |
| **Sidebar Collapse** | Cookie-based `folded` class toggle | localStorage + React state, CSS transitions |
| **Mobile** | Responsive CSS only (no overlay) | True mobile overlay with backdrop, focus trap |
| **Screen Options** | PHP `Screen` class per page, AJAX toggle | React context, per-route configuration, localStorage persistence |
| **Breadcrumbs** | Not built-in (plugins only) | Built-in, route-derived |
| **Auth Display** | `Howdy, Username` dropdown with gravatar | Convex Auth avatar + dropdown with Profile, Log Out |
| **Notifications** | No built-in notification bell | Bell icon with unread count from Site Notification System |
| **Active Indicator** | `wp-has-current-submenu` CSS class | TanStack Router `Link` `activeProps` + parent section tracking |
| **Colors** | Admin color scheme picker (8 built-in schemes) | CSS variables (themed via `index.css` sidebar tokens) |

---

## Architecture Overview

### Layout Hierarchy

```
__root.tsx (ThemeProvider, global providers)
  |
  _authenticated.tsx (Convex Auth auth gate, Convex auth check)
    |
    _admin.tsx (THIS SYSTEM - the admin shell layout)
      |
      +-- AdminBar (top)
      |     +-- SiteNameLink
      |     +-- NotificationBell
      |     +-- UserMenu (avatar + dropdown)
      |
      +-- AdminSidebar (left)
      |     +-- SidebarHeader (logo/brand)
      |     +-- NavSection (Dashboard)
      |     |     +-- NavItem (Dashboard)
      |     +-- NavSection (Posts)
      |     |     +-- NavItem (All Posts)
      |     |     +-- NavItem (Add New Post)
      |     |     +-- NavItem (Categories)
      |     |     +-- NavItem (Tags)
      |     +-- NavSection (Media)
      |     |     +-- NavItem (Library)
      |     |     +-- NavItem (Add New)
      |     +-- NavSection (Pages)
      |     +-- NavSection (Comments) [with pending badge]
      |     +-- NavSection (Users)
      |     +-- NavSection (Appearance)
      |     |     +-- NavItem (Menus)
      |     +-- NavSection (Settings)
      |     |     +-- NavItem (General)
      |     |     +-- NavItem (Reading)
      |     |     +-- NavItem (Writing)
      |     |     +-- NavItem (Discussion)
      |     |     +-- NavItem (Permalinks)
      |     |     +-- NavItem (Privacy)
      |     +-- NavSection (Tools)
      |     +-- SidebarFooter (collapse toggle)
      |
      +-- ContentArea (right, flex-1)
            +-- ScreenOptions (collapsible panel, per-page)
            +-- Breadcrumbs
            +-- <Outlet /> (child route content)
            +-- AdminFooter
```

### Route Nesting

```
TanStack Router File Structure:
src/routes/
  __root.tsx                    <- Global providers
  _authenticated.tsx            <- Auth gate
  _authenticated/_admin.tsx     <- THIS: admin shell layout
  _authenticated/_admin/
    dashboard.tsx               <- /admin/dashboard
    posts/
      index.tsx                 <- /admin/posts
      new.tsx                   <- /admin/posts/new
      $postId/
        edit.tsx                <- /admin/posts/$postId/edit
        revisions.tsx           <- /admin/posts/$postId/revisions
      categories.tsx            <- /admin/posts/categories
      tags.tsx                  <- /admin/posts/tags
    media/
      index.tsx                 <- /admin/media
      new.tsx                   <- /admin/media/new
    pages/
      index.tsx                 <- /admin/pages
      new.tsx                   <- /admin/pages/new
      $pageId/
        edit.tsx                <- /admin/pages/$pageId/edit
    comments/
      index.tsx                 <- /admin/comments
    users/
      index.tsx                 <- /admin/users
      new.tsx                   <- /admin/users/new
      profile.tsx               <- /admin/users/profile
    appearance/
      menus/
        index.tsx               <- /admin/appearance/menus
        $menuId/edit.tsx        <- /admin/appearance/menus/$menuId/edit
        locations.tsx           <- /admin/appearance/menus/locations
    settings/
      general.tsx               <- /admin/settings/general
      reading.tsx               <- /admin/settings/reading
      writing.tsx               <- /admin/settings/writing
      discussion.tsx            <- /admin/settings/discussion
      permalinks.tsx            <- /admin/settings/permalinks
      privacy.tsx               <- /admin/settings/privacy
    tools/
      index.tsx                 <- /admin/tools
```

### Data Flow

```
User navigates to admin route
  -> _authenticated.tsx checks Convex Auth + Convex auth
  -> _admin.tsx (admin shell) renders:
     1. Fetches current user via Convex Auth useAuth()
     2. Fetches user role/capabilities via useQuery(api.users.getRole)
     3. Fetches site title via useQuery(api.settings.get, { key: "site_title" })
     4. Fetches notification count via useQuery(api.notifications.getUnreadCount)
     5. Fetches pending comment count via useQuery(api.comments.getPendingCount)
     6. Filters sidebar nav items by user capabilities
     7. Renders shell with sidebar, admin bar, content area
     8. <Outlet /> renders the child route
```

### Real-Time Behavior

All data consumed by the shell is reactive via Convex subscriptions:

- **Notification count:** Bell badge updates in real-time when new notifications arrive or are read
- **Pending comment count:** Comment badge on sidebar updates when comments are submitted or moderated
- **Site title:** Admin bar site name updates if settings change in another session
- **User data:** Avatar and name update if profile is changed elsewhere

### Component Tree (Simplified)

```tsx
// _admin.tsx
function AdminLayout() {
  return (
    <AdminShellProvider>
      <div className="flex h-svh">
        <AdminSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AdminBar />
          <main className="flex-1 overflow-auto">
            <ScreenOptionsPanel />
            <Breadcrumbs />
            <Outlet />
          </main>
          <AdminFooter />
        </div>
      </div>
      <MobileSidebarOverlay />
    </AdminShellProvider>
  );
}
```

---

## TypeScript Types

### Navigation Configuration

```typescript
// src/lib/admin-shell/types.ts

import type { LucideIcon } from "lucide-react";

/**
 * Represents a single navigation item in the admin sidebar.
 */
export interface AdminNavItem {
  /** Unique identifier for the nav item */
  id: string;
  /** Display label (matches WordPress naming: "All Posts", "Add New", etc.) */
  label: string;
  /** TanStack Router path (e.g., "/admin/posts") */
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
  setScreenOptions: (config: ScreenOptionsConfig | null) => void;
  updateScreenOption: (key: string, value: unknown) => void;
}
```

### User Menu Types

```typescript
/**
 * User data displayed in the admin bar user menu.
 */
export interface AdminBarUser {
  /** user identifier */
  id: string;
  /** Display name (firstName + lastName, or email) */
  displayName: string;
  /** User email */
  email: string;
  /** Avatar URL from the auth system */
  avatarUrl?: string;
  /** User role name */
  role: string;
}
```

---

## Component Inventory

### Core Layout Components

#### `AdminShellProvider`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/AdminShellProvider.tsx`
- **Purpose:** React context provider for shell state (sidebar collapse, mobile overlay, expanded sections, screen options)
- **Props:** `{ children: React.ReactNode }`
- **State Management:** `useReducer` with `AdminShellState` + `AdminShellActions`
- **Persistence:** Sidebar collapse state persisted in `localStorage` key `"admin-sidebar-collapsed"`
- **Responsive:** Listens to `window.matchMedia("(max-width: 1024px)")` to auto-collapse sidebar
- **Base UI Dependencies:** None (pure React context)

#### `_admin.tsx` (Layout Route)

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin.tsx`
- **Purpose:** TanStack Router layout route. Wraps all `/admin/*` child routes with the admin shell.
- **Renders:** `<AdminShellProvider>` wrapping `<AdminSidebar>`, `<AdminBar>`, content area with `<Outlet />`
- **Data Fetches:** User role, site title, notification count, pending comment count
- **Loading State:** Shows full-page skeleton with sidebar placeholder while data loads
- **Base UI Dependencies:** None

### Sidebar Components

#### `AdminSidebar`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/AdminSidebar.tsx`
- **Purpose:** Left sidebar with WordPress-style navigation sections
- **Props:** None (reads from `AdminShellContext`)
- **Behavior:**
  - Renders `SidebarHeader`, list of `NavSection` components, and `SidebarFooter`
  - Filters sections by user capabilities
  - Auto-expands the section containing the current active route
  - Supports collapsed mode (icon-only, 64px wide) and expanded mode (240px wide)
  - Smooth CSS transition on collapse/expand
- **CSS Variables Used:** `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border`
- **Base UI Dependencies:** None

#### `SidebarHeader`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/SidebarHeader.tsx`
- **Purpose:** Top of sidebar showing ConvexPress logo/brand
- **Props:** `{ collapsed: boolean }`
- **Behavior:** Shows full logo text when expanded, icon-only when collapsed
- **Base UI Dependencies:** None

#### `NavSection`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/NavSection.tsx`
- **Purpose:** A collapsible group in the sidebar (e.g., "Posts" with children "All Posts", "Add New", "Categories", "Tags")
- **Props:**
  ```typescript
  {
    section: AdminNavSection;
    collapsed: boolean;        // Sidebar collapsed to icons
    isExpanded: boolean;       // Whether this section's children are visible
    onToggle: () => void;      // Toggle expanded/collapsed
    isActive: boolean;         // Whether current route is in this section
  }
  ```
- **Behavior:**
  - Top-level sections without children navigate directly on click
  - Top-level sections with children toggle expansion on click (or navigate to parent route)
  - In collapsed sidebar mode, hovering shows a flyout with children
  - Active section gets highlighted styling
  - Separator line rendered before section if `separator: true`
- **CSS Variables Used:** `bg-sidebar-accent`, `text-sidebar-accent-foreground`, `bg-sidebar-primary`, `text-sidebar-primary-foreground`
- **Base UI Dependencies:** None (flyout is CSS-based, not a Base UI popup)

#### `NavItem`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/NavItem.tsx`
- **Purpose:** A single navigation link within a section
- **Props:**
  ```typescript
  {
    item: AdminNavItem;
    collapsed: boolean;        // Sidebar collapsed (icon-only)
    depth: number;             // 0 = section parent, 1 = child
  }
  ```
- **Behavior:**
  - Uses TanStack Router `<Link>` with `activeProps` for active state styling
  - Shows badge count if present (e.g., pending comments)
  - "Add New" items styled with a + icon
  - Active state uses `bg-sidebar-primary text-sidebar-primary-foreground`
  - Hover state uses `bg-sidebar-accent text-sidebar-accent-foreground`
- **Base UI Dependencies:** None (uses TanStack Router `<Link>`)

#### `SidebarFooter`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/SidebarFooter.tsx`
- **Purpose:** Bottom of sidebar with collapse/expand toggle button
- **Props:** `{ collapsed: boolean; onToggle: () => void }`
- **Behavior:** Shows `ChevronsLeft` icon when expanded, `ChevronsRight` when collapsed
- **Base UI Dependencies:** None

### Admin Bar Components

#### `AdminBar`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/AdminBar.tsx`
- **Purpose:** Top horizontal bar spanning the content area (right of sidebar)
- **Props:** None (reads from context and Convex queries)
- **Renders:**
  - Left: Hamburger menu button (mobile only), site name link to website frontend
  - Right: Notification bell, user menu
- **Height:** 48px fixed
- **Sticky:** `sticky top-0 z-40` - stays at top when content scrolls
- **CSS Variables Used:** `bg-background`, `border-border`, `text-foreground`
- **Base UI Dependencies:** None

#### `NotificationBell`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/NotificationBell.tsx`
- **Purpose:** Bell icon button with unread notification count badge
- **Props:** None (fetches count via `useQuery(api.notifications.getUnreadCount)`)
- **Behavior:**
  - Shows `Bell` icon from Lucide
  - Shows numeric badge when unread count > 0 (max display "99+")
  - Clicking navigates to `/admin/notifications` or opens a dropdown panel (decision pending)
  - Badge uses `bg-destructive text-destructive-foreground` for urgency
- **Base UI Dependencies:** None (or `DropdownMenu` if panel approach is chosen)

#### `UserMenu`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/UserMenu.tsx`
- **Purpose:** User avatar + name dropdown with profile and logout actions
- **Props:** None (reads user from the auth system `useAuth()`)
- **Behavior:**
  - Shows user avatar (from the auth system) + display name
  - Dropdown items: "Your Profile" (navigates to `/admin/users/profile`), separator, "Log Out" (calls Convex Auth `signOut()`)
  - Uses existing `DropdownMenu` component from `@base-ui/react`
- **Base UI Dependencies:** `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` (all from existing `src/components/ui/dropdown-menu.tsx`)

### Content Area Components

#### `ScreenOptionsPanel`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/ScreenOptionsPanel.tsx`
- **Purpose:** Collapsible panel at the top of the content area for per-page display options
- **Props:** None (reads from `AdminShellContext` screenOptions state)
- **Behavior:**
  - Only renders when `screenOptions !== null` (page has registered options)
  - Toggle button "Screen Options" at top right
  - When expanded, shows column checkboxes and items-per-page selector
  - Changes are saved to `localStorage` per-route key: `"screen-options:${routeId}"`
- **CSS Variables Used:** `bg-card`, `border-border`, `text-card-foreground`
- **Base UI Dependencies:** `Checkbox` (from `@base-ui/react/checkbox`)

#### `Breadcrumbs`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/Breadcrumbs.tsx`
- **Purpose:** Route-based breadcrumb trail at the top of the content area
- **Props:** `{ segments?: BreadcrumbSegment[] }` (optional override, otherwise auto-derived from route)
- **Behavior:**
  - Auto-generates breadcrumbs from current TanStack Router matches
  - First segment is always "Dashboard" linking to `/admin/dashboard`
  - Last segment is plain text (not a link)
  - Segments separated by `ChevronRight` icon
  - Child routes can override breadcrumbs via route context or `staticData`
- **CSS Variables Used:** `text-muted-foreground`, `text-foreground`
- **Base UI Dependencies:** None

#### `AdminFooter`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/AdminFooter.tsx`
- **Purpose:** Footer at the bottom of the admin content area
- **Props:** None
- **Content:**
  - Left: "Thank you for creating with ConvexPress"
  - Right: Version string (e.g., "Version 1.0.0")
- **CSS Variables Used:** `text-muted-foreground`
- **Base UI Dependencies:** None

### Loading & Transition Components

#### `AdminShellSkeleton`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/AdminShellSkeleton.tsx`
- **Purpose:** Full-page skeleton shown while shell data is loading (initial auth/role check)
- **Props:** None
- **Behavior:**
  - Mimics the shell layout: skeleton sidebar (240px), skeleton admin bar (48px), skeleton content area
  - Uses existing `Skeleton` component from `src/components/ui/skeleton.tsx`
- **Base UI Dependencies:** None

#### `PageTransitionIndicator`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/PageTransitionIndicator.tsx`
- **Purpose:** Thin progress bar at the top of the content area during route transitions
- **Props:** None (reads from TanStack Router pending state)
- **Behavior:**
  - Shows a thin animated bar when `router.state.isTransitioning` is true
  - Uses `bg-primary` color
  - Animates width from 0% to 80% on start, 100% on complete
- **Base UI Dependencies:** None

### Mobile Components

#### `MobileSidebarOverlay`

- **File:** `ConvexPress-Admin/apps/web/src/components/layout/MobileSidebarOverlay.tsx`
- **Purpose:** Overlay sidebar for mobile viewports (< 1024px)
- **Props:** None (reads from `AdminShellContext`)
- **Behavior:**
  - Renders a backdrop + sidebar panel when `mobileSidebarOpen` is true
  - Backdrop click or Escape key closes the overlay
  - Sidebar content is the same `AdminSidebar` component in expanded mode
  - Focus trapped inside the overlay when open
  - `aria-hidden="true"` on the main content when overlay is open
- **CSS Variables Used:** `bg-black/50` (backdrop), `bg-sidebar` (panel)
- **Base UI Dependencies:** None (or `Dialog` from `@base-ui/react/dialog` for accessibility)

---

## Hooks

### `useAdminShell`

- **File:** `ConvexPress-Admin/apps/web/src/hooks/layout/useAdminShell.ts`
- **Purpose:** Access admin shell context (state + actions)
- **Returns:** `AdminShellState & AdminShellActions`
- **Usage:**
  ```typescript
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, toggleMobileSidebar } = useAdminShell();
  ```

### `useSidebarCollapse`

- **File:** `ConvexPress-Admin/apps/web/src/hooks/layout/useSidebarCollapse.ts`
- **Purpose:** Manage sidebar collapse state with localStorage persistence and responsive breakpoint detection
- **Returns:**
  ```typescript
  {
    collapsed: boolean;
    toggle: () => void;
    setCollapsed: (value: boolean) => void;
  }
  ```
- **Behavior:**
  - Persists to `localStorage` key `"admin-sidebar-collapsed"`
  - Listens to `(max-width: 1024px)` media query to auto-collapse on smaller viewports
  - On resize to desktop, restores user's previous preference

### `useScreenOptions`

- **File:** `ConvexPress-Admin/apps/web/src/hooks/layout/useScreenOptions.ts`
- **Purpose:** Register and manage screen options for the current admin page
- **Args:** `(routeId: string, defaultConfig: ScreenOptionsConfig)`
- **Returns:**
  ```typescript
  {
    config: ScreenOptionsConfig;
    isOpen: boolean;
    toggle: () => void;
    setColumn: (columnId: string, visible: boolean) => void;
    setPerPage: (value: number) => void;
    setCustom: (fieldId: string, value: unknown) => void;
    reset: () => void;
  }
  ```
- **Behavior:**
  - Registers screen options config in `AdminShellContext` on mount, clears on unmount
  - Persists settings to `localStorage` key `"screen-options:${routeId}"`
  - Merges persisted settings with defaults on mount

### `useBreadcrumbs`

- **File:** `ConvexPress-Admin/apps/web/src/hooks/layout/useBreadcrumbs.ts`
- **Purpose:** Auto-generate or override breadcrumb segments for the current route
- **Args:** `(overrides?: BreadcrumbSegment[])`
- **Returns:** `BreadcrumbSegment[]`
- **Behavior:**
  - Uses `useMatches()` from TanStack Router to get the current route match chain
  - Maps route segments to human-readable labels using a lookup map
  - Dynamic segments (e.g., `$postId`) are resolved to the resource title via route `loaderData` or a separate query
  - Always starts with `{ label: "Dashboard", to: "/admin/dashboard" }`
  - Overrides replace the auto-generated breadcrumbs entirely

### `useActiveSection`

- **File:** `ConvexPress-Admin/apps/web/src/hooks/layout/useActiveSection.ts`
- **Purpose:** Determine which sidebar section contains the current route
- **Returns:** `string | null` (section ID)
- **Behavior:**
  - Uses `useRouterState()` from TanStack Router to get current path
  - Matches against nav section routes to find the active section
  - Used by `AdminSidebar` to auto-expand the correct section

### `useNotificationCount`

- **File:** `ConvexPress-Admin/apps/web/src/hooks/layout/useNotificationCount.ts`
- **Purpose:** Reactive unread notification count for the admin bar bell
- **Returns:** `number | undefined` (undefined while loading)
- **Behavior:**
  - Wraps `useQuery(api.notifications.getUnreadCount)` from Convex
  - Returns 0 when user has no notifications
  - Updates in real-time via Convex subscription

### `usePendingCommentCount`

- **File:** `ConvexPress-Admin/apps/web/src/hooks/layout/usePendingCommentCount.ts`
- **Purpose:** Reactive pending comment count for the Comments sidebar badge
- **Returns:** `number | undefined`
- **Behavior:**
  - Wraps `useQuery(api.comments.getPendingCount)` from Convex
  - Only called for users with `moderate_comments` capability
  - Used as `badge` prop on the Comments `NavSection`

---

## Navigation Configuration

### Sidebar Sections Definition

```typescript
// src/lib/admin-shell/nav-config.ts

import {
  LayoutDashboard,
  FileText,
  Image,
  File,
  MessageSquare,
  Users,
  Palette,
  Settings,
  Wrench,
} from "lucide-react";
import type { AdminNavSection } from "./types";

/**
 * Admin sidebar navigation configuration.
 * Mirrors WordPress admin menu structure.
 * Items are filtered at render time by user capabilities.
 */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    to: "/admin/dashboard",
    icon: LayoutDashboard,
    // No capability - all authenticated admin users can see Dashboard
  },
  {
    id: "posts",
    label: "Posts",
    to: "/admin/posts",
    icon: FileText,
    capability: "edit_posts",
    separator: true,
    children: [
      { id: "posts-all", label: "All Posts", to: "/admin/posts", exact: true },
      { id: "posts-new", label: "Add New Post", to: "/admin/posts/new", isAddNew: true },
      { id: "posts-categories", label: "Categories", to: "/admin/posts/categories", capability: "manage_categories" },
      { id: "posts-tags", label: "Tags", to: "/admin/posts/tags", capability: "manage_categories" },
    ],
  },
  {
    id: "media",
    label: "Media",
    to: "/admin/media",
    icon: Image,
    capability: "upload_files",
    children: [
      { id: "media-library", label: "Library", to: "/admin/media", exact: true },
      { id: "media-new", label: "Add New", to: "/admin/media/new", isAddNew: true },
    ],
  },
  {
    id: "pages",
    label: "Pages",
    to: "/admin/pages",
    icon: File,
    capability: "edit_pages",
    children: [
      { id: "pages-all", label: "All Pages", to: "/admin/pages", exact: true },
      { id: "pages-new", label: "Add New Page", to: "/admin/pages/new", isAddNew: true },
    ],
  },
  {
    id: "comments",
    label: "Comments",
    to: "/admin/comments",
    icon: MessageSquare,
    capability: "moderate_comments",
    // badge: dynamically set from usePendingCommentCount()
  },
  {
    id: "users",
    label: "Users",
    to: "/admin/users",
    icon: Users,
    capability: "list_users",
    separator: true,
    children: [
      { id: "users-all", label: "All Users", to: "/admin/users", exact: true, capability: "list_users" },
      { id: "users-new", label: "Add New User", to: "/admin/users/new", isAddNew: true, capability: "create_users" },
      { id: "users-profile", label: "Your Profile", to: "/admin/users/profile" },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    to: "/admin/appearance/menus",
    icon: Palette,
    capability: "edit_theme_options",
    separator: true,
    children: [
      { id: "appearance-menus", label: "Menus", to: "/admin/appearance/menus" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    to: "/admin/settings/general",
    icon: Settings,
    capability: "manage_options",
    children: [
      { id: "settings-general", label: "General", to: "/admin/settings/general" },
      { id: "settings-reading", label: "Reading", to: "/admin/settings/reading" },
      { id: "settings-writing", label: "Writing", to: "/admin/settings/writing" },
      { id: "settings-discussion", label: "Discussion", to: "/admin/settings/discussion" },
      { id: "settings-permalinks", label: "Permalinks", to: "/admin/settings/permalinks" },
      { id: "settings-privacy", label: "Privacy", to: "/admin/settings/privacy" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    to: "/admin/tools",
    icon: Wrench,
    capability: "manage_options",
    separator: true,
  },
];
```

### Breadcrumb Label Map

```typescript
// src/lib/admin-shell/breadcrumb-labels.ts

/**
 * Maps route path segments to human-readable breadcrumb labels.
 * Dynamic segments ($param) are resolved from route data at runtime.
 */
export const BREADCRUMB_LABELS: Record<string, string> = {
  "admin": "Admin",
  "dashboard": "Dashboard",
  "posts": "Posts",
  "new": "Add New",
  "edit": "Edit",
  "categories": "Categories",
  "tags": "Tags",
  "revisions": "Revisions",
  "media": "Media",
  "pages": "Pages",
  "comments": "Comments",
  "users": "Users",
  "profile": "Your Profile",
  "appearance": "Appearance",
  "menus": "Menus",
  "locations": "Menu Locations",
  "settings": "Settings",
  "general": "General",
  "reading": "Reading",
  "writing": "Writing",
  "discussion": "Discussion",
  "permalinks": "Permalinks",
  "privacy": "Privacy",
  "tools": "Tools",
};
```

---

## Backend Integration

**CRITICAL: This system NEVER defines its own Convex queries or mutations.** All backend data is consumed from other systems' existing queries.

### Convex Queries Consumed

| Query | Source System | Used By | Purpose |
|-------|-------------|---------|---------|
| `api.users.getRole` | Role & Capability System | `_admin.tsx` | Get current user's role and capabilities for nav filtering |
| `api.settings.get` | Settings System | `AdminBar` | Fetch site title for display in admin bar |
| `api.notifications.getUnreadCount` | Site Notification System | `NotificationBell` | Unread notification count for bell badge |
| `api.comments.getPendingCount` | Comment System | `AdminSidebar` | Pending comment count for Comments badge |
| `api.users.checkAdminAccess` | Auth System | `_authenticated.tsx` (already exists) | Verify user has admin access |

### Convex Auth Hooks Consumed

| Hook | Used By | Purpose |
|------|---------|---------|
| `useAuth()` | `UserMenu`, `AdminBar` | Get current user data (name, email, avatar), signOut function |

### Capability Check Pattern

The shell does NOT perform backend capability checks itself. Instead, it:

1. Fetches the user's role/capabilities once via `api.users.getRole`
2. Passes capabilities to a client-side helper: `hasCapability(userCapabilities, requiredCapability)`
3. Uses this to filter `ADMIN_NAV_SECTIONS` before rendering

```typescript
// src/lib/admin-shell/capabilities.ts

/**
 * Check if the user's capabilities include the required capability.
 * Pure client-side check for UI filtering only.
 * Actual authorization happens server-side in Convex mutations.
 */
export function hasCapability(
  userCapabilities: string[],
  requiredCapability: string | undefined,
): boolean {
  if (!requiredCapability) return true; // No capability required
  return userCapabilities.includes(requiredCapability);
}

/**
 * Filter nav sections by user capabilities.
 * Removes sections and items the user cannot access.
 */
export function filterNavSections(
  sections: AdminNavSection[],
  userCapabilities: string[],
): AdminNavSection[] {
  return sections
    .filter((section) => hasCapability(userCapabilities, section.capability))
    .map((section) => ({
      ...section,
      children: section.children?.filter((item) =>
        hasCapability(userCapabilities, item.capability),
      ),
    }));
}
```

---

## Accessibility

### ARIA Landmarks

```html
<!-- Shell structure with ARIA landmarks -->
<div class="flex h-svh">
  <nav aria-label="Admin navigation">           <!-- AdminSidebar -->
    <div role="heading" aria-level="2">ConvexPress</div>
    <ul role="list">
      <li>
        <button aria-expanded="true|false" aria-controls="section-posts-children">
          Posts
        </button>
        <ul id="section-posts-children" role="list">
          <li><a aria-current="page">All Posts</a></li>
          ...
        </ul>
      </li>
    </ul>
  </nav>

  <div class="flex flex-1 flex-col">
    <header role="banner">                      <!-- AdminBar -->
      <a href="/">Visit Site</a>
      <button aria-label="Notifications (3 unread)">
        <span aria-hidden="true">3</span>
      </button>
      <button aria-haspopup="true" aria-expanded="false">
        User Menu
      </button>
    </header>

    <main id="admin-content" role="main">       <!-- Content area -->
      <nav aria-label="Breadcrumb">             <!-- Breadcrumbs -->
        <ol>...</ol>
      </nav>
      <!-- Outlet renders here -->
    </main>

    <footer role="contentinfo">                 <!-- AdminFooter -->
      ...
    </footer>
  </div>
</div>
```

### Skip to Content Link

```tsx
// Rendered at the very top of _admin.tsx, visually hidden until focused
<a
  href="#admin-content"
  className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2"
>
  Skip to main content
</a>
```

### Keyboard Navigation

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Sidebar | Move between nav items |
| `Enter` / `Space` | Sidebar section | Toggle section expand/collapse |
| `Enter` / `Space` | Nav item | Navigate to route |
| `Escape` | Mobile overlay | Close sidebar overlay |
| `Escape` | User menu dropdown | Close dropdown |
| `Arrow Up/Down` | User menu dropdown | Navigate dropdown items |
| `Tab` | Screen Options panel | Move between checkboxes/inputs |

### Focus Management

- **Mobile sidebar open:** Focus is trapped inside the overlay. First focusable element receives focus on open. Focus returns to hamburger button on close.
- **Route change:** Focus moves to `#admin-content` (or the page heading) after navigation for screen readers.
- **Dropdown menus:** Focus returns to trigger button when dropdown closes.

---

## Styling Patterns

### CSS Variable Usage

The admin shell uses dedicated sidebar CSS variables defined in `index.css`:

| Variable | Light Mode | Dark Mode | Usage |
|----------|-----------|-----------|-------|
| `--sidebar` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | Sidebar background |
| `--sidebar-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Sidebar text |
| `--sidebar-primary` | `oklch(0.205 0 0)` | `oklch(0.488 0.243 264.376)` | Active nav item background |
| `--sidebar-primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.985 0 0)` | Active nav item text |
| `--sidebar-accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Hover nav item background |
| `--sidebar-accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | Hover nav item text |
| `--sidebar-border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | Sidebar border |
| `--sidebar-ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | Sidebar focus ring |

### Layout Dimensions

| Element | Size | Notes |
|---------|------|-------|
| Sidebar expanded width | `240px` (`w-60`) | Standard WordPress-like width |
| Sidebar collapsed width | `64px` (`w-16`) | Icon-only mode |
| Admin bar height | `48px` (`h-12`) | Fixed, sticky |
| Footer height | `40px` (`h-10`) | Fixed |
| Sidebar transition | `300ms ease-in-out` | Width transition |
| Content area | `flex-1 min-w-0` | Takes remaining space |

### Z-Index Stack

| Element | Z-Index | Notes |
|---------|---------|-------|
| Admin bar | `z-40` | Above content, below modals |
| Sidebar | `z-30` | Behind admin bar on overlap |
| Mobile overlay backdrop | `z-50` | Above everything |
| Mobile sidebar panel | `z-50` | Same as backdrop |
| Dropdown menus | `z-50` | Standard popover z-index |
| Skip-to-content link | `z-[100]` | Above everything when focused |

### Responsive Breakpoints

| Breakpoint | Sidebar Behavior | Admin Bar Behavior |
|------------|-----------------|-------------------|
| `>= 1024px` (lg) | Persistent, expanded or collapsed (user preference) | Full width right of sidebar |
| `768px - 1023px` (md) | Persistent, auto-collapsed to icons | Full width right of sidebar |
| `< 768px` (sm) | Hidden, shown as overlay on hamburger click | Full width, shows hamburger button |

---

## Routes

### `_admin.tsx` Layout Route

```typescript
// ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin.tsx

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-admin/backend/convex/_generated/api";

import { AdminShellProvider } from "@/components/layout/AdminShellProvider";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminBar } from "@/components/layout/AdminBar";
import { AdminFooter } from "@/components/layout/AdminFooter";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { AdminShellSkeleton } from "@/components/layout/AdminShellSkeleton";
import { MobileSidebarOverlay } from "@/components/layout/MobileSidebarOverlay";
import { PageTransitionIndicator } from "@/components/layout/PageTransitionIndicator";

export const Route = createFileRoute("/_authenticated/_admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const userRole = useQuery(api.users.getRole);
  const siteTitle = useQuery(api.settings.get, { key: "site_title" });

  // Loading state while role and settings are fetching
  if (userRole === undefined || siteTitle === undefined) {
    return <AdminShellSkeleton />;
  }

  return (
    <AdminShellProvider userCapabilities={userRole.capabilities}>
      {/* Skip to content link */}
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2"
      >
        Skip to main content
      </a>

      <div className="flex h-svh">
        <AdminSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AdminBar siteTitle={siteTitle?.value ?? "ConvexPress"} />
          <PageTransitionIndicator />
          <main id="admin-content" role="main" className="flex-1 overflow-auto p-6">
            <Breadcrumbs />
            <Outlet />
          </main>
          <AdminFooter />
        </div>
      </div>

      <MobileSidebarOverlay />
    </AdminShellProvider>
  );
}
```

### Dashboard Default Route

The `_admin.tsx` layout should redirect `/admin` to `/admin/dashboard` if no child route is matched. This can be done via a redirect in the route definition or an index route.

---

## Known Gaps & Decisions

### Open Questions

1. **Sidebar collapse persistence: localStorage vs database**
   - **Current Decision:** localStorage. Simple, no backend dependency. User preferences stay on their browser.
   - **Alternative:** Store in Convex `userMeta` table for cross-device persistence. Deferred to future version.
   - **Impact:** Low. Sidebar collapse is a convenience, not critical data.

2. **Mobile sidebar behavior: overlay vs push**
   - **Current Decision:** Overlay with backdrop. The main content stays in place and a slide-in panel covers it.
   - **Rationale:** Push layout causes content reflow and layout shifts on mobile. Overlay is the standard modern pattern.

3. **Admin bar sticky behavior on scroll**
   - **Current Decision:** `sticky top-0`. Admin bar stays fixed at the top of the content column while scrolling.
   - **Alternative:** Static (scrolls with content). WordPress uses fixed. We follow WordPress.

4. **Screen Options implementation pattern**
   - **Current Decision:** Per-page hook (`useScreenOptions`) that registers config in shell context. Each admin page calls the hook if it needs screen options.
   - **Alternative:** Route-level `staticData` with screen options config. Simpler but less dynamic.
   - **Note:** Not all pages need screen options. Only list table pages (All Posts, All Pages, Comments, Users, Media Library) typically have them.

5. **Notification bell behavior: dropdown panel vs full page**
   - **Current Decision:** Deferred. Could go either way.
   - **Option A:** Click navigates to `/admin/notifications` (full page). Simpler.
   - **Option B:** Click opens a dropdown panel with recent notifications, "View All" link. More discoverable.
   - **Recommendation:** Option A for initial implementation. Option B as enhancement.

6. **Admin color scheme customization**
   - **Current Decision:** Not implemented. Single color scheme (from CSS variables in `index.css`).
   - **WordPress Equivalent:** Admin > Users > Your Profile > Admin Color Scheme (8 built-in schemes).
   - **Impact:** Low priority. Theming is functional via CSS variable overrides. Can add scheme picker later.

7. **Keyboard shortcut system**
   - **Current Decision:** Not part of initial shell implementation.
   - **WordPress Equivalent:** `wp-admin/js/common.js` keyboard shortcut handler.
   - **Potential shortcuts:** `Alt+1` Dashboard, `Alt+2` Posts, etc. Deferred.

### Architectural Decisions (Final)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State management | React Context + useReducer | Shell state is component-scoped, no need for global store |
| Persistence | localStorage | No server round-trip for UI preferences |
| Nav config | Static array in code | Menu structure matches WordPress, rarely changes at runtime |
| Capability filtering | Client-side filter | UI-only gating; real authorization is server-side in Convex |
| Mobile breakpoint | 1024px (lg) | Standard tablet/desktop boundary |
| Animation library | CSS transitions only | No additional dependency; transitions are simple width/opacity |
| Base UI usage | DropdownMenu only | Other shell components are simple enough for native HTML + Tailwind |

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|----------------|
| **Auth System** | **Hard** | Convex Auth `useAuth()` for user identity, avatar, signOut. Shell cannot render without authenticated user. |
| **Role & Capability System** | **Hard** | `api.users.getRole` query for capabilities. Sidebar filtering depends entirely on this. |
| **Menu System** | **Hard** | Admin sidebar navigation items and sections. The static nav config mirrors the menu structure, but future enhancement may load nav from Menu System. |
| **Dashboard System** | **Hard** | Dashboard is the default landing page (`/admin/dashboard`). Shell redirects to it. |
| **Site Notification System** | **Medium** | `api.notifications.getUnreadCount` query for bell badge. Shell works without it (badge shows 0). |
| **Settings System** | **Medium** | `api.settings.get` for site title display in admin bar. Falls back to "ConvexPress" if unavailable. |
| **Comment System** | **Soft** | `api.comments.getPendingCount` for Comments sidebar badge. Optional enhancement. |

### Depended On By

Every admin route depends on this system. The admin shell is the outermost layout for all admin pages.

| System | Type | What They Need |
|--------|------|----------------|
| **All Admin Routes** | **Hard** | Every `/admin/*` route renders inside the shell's `<Outlet />` |
| **Admin List Table UI Expert** | **Hard** | Uses `ScreenOptionsPanel` for column visibility and items-per-page |
| **Admin Editor Layout UI Expert** | **Medium** | Renders within the shell, may adjust breadcrumbs |
| **Admin Settings & Forms UI Expert** | **Medium** | Renders within the shell content area |

---

## Implementation Checklist

### Layout Route

- [ ] `src/routes/_authenticated/_admin.tsx` - Admin shell layout route with providers, sidebar, admin bar, outlet

### Components (`src/components/layout/`)

- [ ] `AdminShellProvider.tsx` - Context provider with shell state (sidebar, mobile, sections, screen options)
- [ ] `AdminSidebar.tsx` - Left sidebar with nav sections, capability filtering, collapse support
- [ ] `SidebarHeader.tsx` - Logo/brand at top of sidebar
- [ ] `NavSection.tsx` - Collapsible nav section (parent + children)
- [ ] `NavItem.tsx` - Single navigation link with active state, badge, icon
- [ ] `SidebarFooter.tsx` - Collapse/expand toggle button
- [ ] `AdminBar.tsx` - Top horizontal bar with site link, notifications, user menu
- [ ] `NotificationBell.tsx` - Bell icon with unread count badge
- [ ] `UserMenu.tsx` - User avatar + dropdown (Profile, Log Out)
- [ ] `ScreenOptionsPanel.tsx` - Collapsible per-page display options panel
- [ ] `Breadcrumbs.tsx` - Route-based breadcrumb trail
- [ ] `AdminFooter.tsx` - Footer with version info
- [ ] `AdminShellSkeleton.tsx` - Full-page loading skeleton
- [ ] `PageTransitionIndicator.tsx` - Thin progress bar during route transitions
- [ ] `MobileSidebarOverlay.tsx` - Mobile sidebar overlay with backdrop

### Hooks (`src/hooks/layout/`)

- [ ] `useAdminShell.ts` - Access shell context
- [ ] `useSidebarCollapse.ts` - Sidebar collapse with localStorage persistence
- [ ] `useScreenOptions.ts` - Per-page screen options registration and management
- [ ] `useBreadcrumbs.ts` - Auto-generate or override breadcrumbs
- [ ] `useActiveSection.ts` - Determine active sidebar section from current route
- [ ] `useNotificationCount.ts` - Reactive unread notification count
- [ ] `usePendingCommentCount.ts` - Reactive pending comment count for sidebar badge

### Lib (`src/lib/admin-shell/`)

- [ ] `types.ts` - TypeScript types (AdminNavItem, AdminNavSection, ScreenOptionsConfig, BreadcrumbSegment, AdminShellState, AdminShellActions)
- [ ] `nav-config.ts` - Sidebar navigation section configuration (static array)
- [ ] `breadcrumb-labels.ts` - Route segment to label mapping
- [ ] `capabilities.ts` - Client-side capability checking helpers (hasCapability, filterNavSections)
- [ ] `constants.ts` - Layout dimension constants, localStorage keys, z-index values

---

## Edge Cases & Gotchas

1. **Auth loading race condition:** The shell must wait for both Convex Auth auth and Convex auth to complete before rendering. Show `AdminShellSkeleton` until `userRole !== undefined`. Never render sidebar with unfiltered nav items.

2. **Sidebar flyout in collapsed mode:** When the sidebar is collapsed to icons and the user hovers over a section with children, a flyout panel should appear to the right. This flyout must not interfere with the content area layout. Use `position: absolute` relative to the sidebar. On mobile, this flyout behavior is disabled (mobile uses the overlay instead).

3. **Route mismatch after capability change:** If an admin's role is changed while they are logged in (e.g., demoted from Administrator to Author), the sidebar should update reactively (Convex subscription on `api.users.getRole`). However, the user may be viewing a page they no longer have access to. The child route should handle its own access denied state; the shell just updates the sidebar.

4. **Screen options persistence collision:** If two admin pages share a route ID pattern (unlikely with TanStack Router's file-based routing), their screen options could collide in localStorage. Use the full route path as the key, not just the last segment.

5. **Mobile sidebar close on navigation:** When a user taps a nav item in the mobile sidebar overlay, the overlay should close immediately and the route should change. Use a `useEffect` that watches `router.state.location` and calls `closeMobileSidebar()`.

6. **Breadcrumb dynamic segments:** Routes with dynamic parameters (e.g., `/admin/posts/$postId/edit`) need the actual resource title for the breadcrumb. The `$postId` segment should resolve to "Edit: My Post Title". This requires the child route to provide the title via route context, loader data, or a separate lightweight query.

7. **Admin bar "Visit Site" link:** The site name link in the admin bar should open the website frontend in a new tab (`target="_blank"`). The URL should be the website's public URL, not the admin URL. This URL can be derived from settings or environment variable.

8. **Notification count polling vs subscription:** Convex subscriptions are reactive, so the notification count updates automatically. No polling needed. However, if the `getUnreadCount` query is expensive, consider caching or rate-limiting on the server side.

9. **Sidebar section auto-expand on direct URL:** If a user navigates directly to `/admin/settings/permalinks` via URL, the Settings section in the sidebar must auto-expand to show the active child item. The `useActiveSection` hook handles this on initial render.

10. **Admin bar height consistency:** All content must account for the 48px admin bar height. Since the admin bar is `sticky top-0` inside the flex column (not fixed to the viewport), it does not overlap content. But if any child route uses `sticky` positioning, they must account for the admin bar.

11. **Focus management on route change:** When navigating between admin pages, screen readers need to know the page changed. Consider announcing the page title via a visually-hidden `aria-live` region, or moving focus to the page heading.

12. **localStorage availability:** In rare cases (private browsing in some browsers, storage quota exceeded), localStorage may not be available. The sidebar collapse and screen options hooks should catch errors and fall back to in-memory defaults.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `wp-admin/admin-header.php` | `AdminBar` + `_admin.tsx` layout | Top bar and page wrapper |
| `wp-admin/admin-footer.php` | `AdminFooter` | Footer with version info |
| `wp-admin/menu.php` | `nav-config.ts` | Admin menu definition |
| `wp-admin/menu-header.php` | `AdminSidebar` + `NavSection` + `NavItem` | Sidebar rendering |
| `wp-admin/includes/admin-bar.php` | `AdminBar` | Top admin bar |
| `WP_Admin_Bar` class | `AdminBar` component | Admin bar rendering and items |
| `add_menu_page()` | Add entry to `ADMIN_NAV_SECTIONS` | Register top-level admin page |
| `add_submenu_page()` | Add child to section's `children` array | Register sub-page |
| `current_user_can()` | `hasCapability()` helper | Client-side capability check |
| `WP_Screen` class | `useScreenOptions()` hook | Per-page screen options |
| `get_current_screen()` | `useScreenOptions()` hook context | Access current page screen options |
| `add_screen_option()` | `useScreenOptions(routeId, config)` | Register screen options for a page |
| `admin_body_class` filter | CSS classes on `_admin.tsx` wrapper | Conditional CSS classes |
| `admin_footer_text` filter | `AdminFooter` component | Footer text content |
| `wp_admin_bar_render()` | `AdminBar` component render | Render the admin bar |
| `is_admin_bar_showing()` | Always true inside `_admin.tsx` | Admin bar always shows in admin shell |

---

## Shared TypeScript Types (Summary)

```typescript
// All types defined in src/lib/admin-shell/types.ts

export interface AdminNavItem { ... }          // Single nav link
export interface AdminNavSection { ... }       // Collapsible nav section
export interface ScreenOptionsConfig { ... }   // Per-page screen options
export interface ScreenOptionsColumn { ... }   // Column visibility toggle
export interface ScreenOptionsCustomField { ... } // Custom screen option
export interface BreadcrumbSegment { ... }      // Breadcrumb trail segment
export interface AdminShellState { ... }        // Shell context state
export interface AdminShellActions { ... }      // Shell context actions
export interface AdminBarUser { ... }           // User data for admin bar
```
