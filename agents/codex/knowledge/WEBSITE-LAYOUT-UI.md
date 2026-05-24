# Website Layout & Navigation UI - Expert Knowledge Document

**System:** Website Layout & Navigation UI
**Expert Type:** Website UI Expert
**Status:** Implementation Ready
**Priority:** P0 - Critical
**WordPress Equivalent:** `header.php`, `footer.php`, `sidebar.php`, `get_template_part()`, `wp_nav_menu()`, `register_nav_menus()`, `dynamic_sidebar()`, `wp_head()`, `wp_footer()`, theme template hierarchy for layout shells
**Last Analyzed:** 2026-02-09
**Airtable Expert Record:** `[redacted-airtable-record-id]`

---

## IMPORTANT: Auth & UI Stack

**The auth provider is Convex Auth. The UI library is @base-ui/react. The framework is TanStack Start (SSR).**

Key technology rules:

- **Auth Provider:** Convex Auth
- **Client Package:** `@auth/authkit-tanstack-react-start` for website
- **UI Library:** `@base-ui/react` -- NEVER use Radix (`@radix-ui/*`), NEVER use shadcn
- **Framework:** TanStack Start (SSR) -- NOT Next.js
- **Database:** Convex -- Website is a CONSUMER (never deploys, never owns schema, never defines mutations/queries)
- **Styling:** Tailwind CSS v4 with CSS custom properties -- NEVER hardcoded colors (no zinc, slate, gray)
- **Icons:** Lucide React
- **Toasts:** Sonner

---

## Quick Reference

### What This Expert Does

The Website Layout & Navigation UI Expert owns the outermost layout framework for all public-facing and authenticated user-facing pages in the website app (`ConvexPress-Website/`). It provides the site header (logo, primary navigation, search, user menu), desktop and mobile navigation, site footer (footer nav, widget areas, copyright, social links), optional sidebar layout with widget areas, content area wrapper, breadcrumb trail, skip-to-content accessibility link, back-to-top button, admin bar for logged-in administrators, two layout variants (`_marketing` and `_dashboard`), responsive design, and page transition animations. Every website page renders inside one of these layout shells. Without this system, there is no website interface.

This is a **frontend-only** system. It consumes Convex queries (for menu data, site settings, theme configuration, widget areas, user data) but NEVER defines its own Convex functions. All backend logic lives in the respective system experts (Menu System, theme configuration, widgets, Settings System, Auth System, Search System, User Profile System).

This expert does NOT:
- Define Convex queries or mutations (those belong to Menu System, theme configuration, widgets, Settings System, etc.)
- Handle authentication logic or token management (that belongs to Auth System / Website Auth Pages UI Expert)
- Manage the content within pages (that belongs to Website Blog & Content UI Expert, Website User Dashboard UI Expert)
- Control admin-side navigation (that belongs to Admin Shell & Navigation UI Expert)

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Marketing Layout** | `_marketing.tsx` -- Layout route for all public pages: Header + Content + optional Sidebar + Footer |
| **Dashboard Layout** | `_dashboard.tsx` -- Layout route for authenticated user pages: Header + Dashboard Sidebar + Content + Footer |
| **Site Header** | Top bar with logo, primary navigation, search, and user menu/login link |
| **Primary Navigation** | Horizontal desktop nav with dropdown submenus, sourced from Menu System's "header" location |
| **Mobile Navigation** | Hamburger-triggered slide-out/overlay nav for small screens |
| **Site Footer** | Bottom section with footer navigation, widget areas, copyright, and social links |
| **Widget Area** | A slot in the layout (sidebar, footer columns) where widget instances are rendered |
| **Breadcrumb Trail** | Route-based or content-hierarchy-based navigation breadcrumbs |
| **Admin Bar** | Thin bar at the top of the page for logged-in administrators with "Edit This Page" and admin links |
| **Skip-to-Content** | Accessibility link (visually hidden until focused) that jumps to the main content area |
| **Back-to-Top** | Floating button that appears on scroll and scrolls the user back to the top of the page |
| **Content Wrapper** | The `max-width`, padding, and responsive breakpoints wrapper around the `<Outlet />` |
| **Theme CSS Injection** | Global styles from the active theme injected as CSS custom properties in `<head>` |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Header** | `header.php` with `wp_head()` action, `wp_nav_menu()` | `SiteHeader` React component consuming Menu System Convex query |
| **Footer** | `footer.php` with `wp_footer()` action, `dynamic_sidebar()` | `SiteFooter` React component with widget areas + footer nav |
| **Sidebar** | `sidebar.php` with `dynamic_sidebar('sidebar-1')` | `Sidebar` React component rendering widget instances |
| **Navigation** | `wp_nav_menu($args)` PHP function with Walker | `NavMenu` React component tree with recursive dropdown rendering |
| **Mobile nav** | Theme-specific (no standard) | Built-in `MobileNav` overlay component |
| **Template parts** | `get_template_part('template-parts/header', 'default')` | Layout route components (`_marketing.tsx`, `_dashboard.tsx`) |
| **Body class** | `body_class()` adds contextual CSS classes | Tailwind classes on layout wrapper elements |
| **Admin bar** | `wp_admin_bar` rendered when `is_admin_bar_showing()` | `AdminBar` component shown when user has admin capabilities |
| **Breadcrumbs** | Plugin-only (Yoast, Rank Math, etc.) | Built-in `Breadcrumbs` component |
| **Skip link** | Theme-specific (Twenty Twenty-One includes it) | Built-in accessibility requirement |
| **Back to top** | Plugin or theme feature | Built-in `BackToTop` component |
| **Reactivity** | Full page reload on navigation | SPA-like navigation via TanStack Start, menus update in real-time via Convex |
| **Widget areas** | `dynamic_sidebar()` in PHP template | `<WidgetArea slug="sidebar-1" />` React component with Convex subscription |
| **Responsive** | Theme-specific CSS media queries | Mobile-first Tailwind breakpoints (sm/md/lg/xl) |
| **SEO** | `wp_head()` outputs meta tags | TanStack Start `head()` configuration per route |
| **Logo** | `the_custom_logo()` or `bloginfo('name')` | Settings/theme configuration Convex query for logo URL |

---

## Architecture Overview

### Layout Hierarchy

```
__root.tsx (ConvexProvider, AuthKitProvider, global <html>/<body>, Toaster)
  |
  +-- <Header />  (currently in __root.tsx -- will move to layout routes)
  +-- <Outlet />
        |
        +-- _marketing.tsx (THIS SYSTEM -- marketing layout shell)
        |     |
        |     +-- SiteHeader
        |     |     +-- SkipToContent link
        |     |     +-- AdminBar (for logged-in admins)
        |     |     +-- HeaderBar
        |     |           +-- SiteBrand (logo + site title)
        |     |           +-- DesktopNav (horizontal nav with dropdowns)
        |     |           +-- HeaderActions (search toggle, user menu/login)
        |     +-- MobileNav (overlay, shown on hamburger click)
        |     +-- ContentArea
        |     |     +-- Breadcrumbs (optional, per-route)
        |     |     +-- <div class="flex">
        |     |           +-- <main> <Outlet /> </main>
        |     |           +-- <Sidebar /> (optional, from the active theme config)
        |     +-- SiteFooter
        |           +-- FooterWidgetAreas (footer-1, footer-2, footer-3)
        |           +-- FooterNav (footer menu location)
        |           +-- FooterBottom (copyright, social links)
        |
        +-- _dashboard.tsx (THIS SYSTEM -- dashboard layout shell)
              |
              +-- SiteHeader (same as marketing, possibly simplified)
              +-- <div class="flex">
              |     +-- DashboardSidebar (vertical nav for user dashboard)
              |     +-- <main> <Outlet /> </main>
              +-- SiteFooter (possibly simplified)
```

### Route Nesting

```
TanStack Start File Structure:
src/routes/
  __root.tsx                         <- Global providers, <html>/<body>
  _marketing.tsx                     <- THIS: public marketing layout
  _marketing/
    index.tsx                        <- / (homepage)
    blog/
      index.tsx                      <- /blog
      $slug.tsx                      <- /blog/:slug
    page/
      $slug.tsx                      <- /page/:slug (static pages)
    category/
      $slug.tsx                      <- /category/:slug
    tag/
      $slug.tsx                      <- /tag/:slug
    author/
      $slug.tsx                      <- /author/:slug
    search.tsx                       <- /search?q=...
    archive.tsx                      <- /archive
  _dashboard.tsx                     <- THIS: authenticated user layout
  _dashboard/
    index.tsx                        <- /dashboard
    profile.tsx                      <- /dashboard/profile
    settings.tsx                     <- /dashboard/settings
    posts.tsx                        <- /dashboard/posts (user's own posts)
    notifications.tsx                <- /dashboard/notifications
  login.tsx                          <- /login (outside layouts, uses AuthPageLayout)
  register.tsx                       <- /register
  forgot-password.tsx                <- /forgot-password
  api/auth/callback.tsx              <- /api/auth/callback
```

### Data Flow

```
User navigates to a website route
  -> __root.tsx renders ConvexProvider + AuthKitProvider
  -> _marketing.tsx (or _dashboard.tsx) layout renders:
     1. Fetches site settings via useQuery(api.settings.getPublic)
        - Site title, tagline, logo URL, homepage display mode
     2. Fetches active theme via useQuery(api.themes.getActive)
        - CSS custom properties for global styles
        - Sidebar position (left/right/none) per content type
     3. Fetches header menu via useQuery(api.menus.getMenuForLocation, { location: "header" })
        - Full menu tree with resolved URLs
     4. Fetches footer menu via useQuery(api.menus.getMenuForLocation, { location: "footer" })
     5. Fetches social links menu via useQuery(api.menus.getMenuForLocation, { location: "social" })
     6. Fetches footer widget areas via useQuery(api.widgets.getAreaWidgets, { slug: "footer-1" }) (x3)
     7. Reads auth state via useAuth() for login/logout display + admin bar
     8. Renders layout shell with header, content outlet, optional sidebar, footer
     9. <Outlet /> renders the matched child route
```

### Real-Time Behavior

All data consumed by the layout is reactive via Convex subscriptions:

- **Navigation menus:** If an admin edits the header menu in the admin panel, the website navigation updates in real-time for all connected users -- no page reload needed.
- **Site settings:** If the admin changes the site title or logo, the header updates live.
- **Theme styles:** If the admin adjusts colors or typography in the theme editor, the CSS custom properties update immediately on all connected website pages.
- **Widget areas:** If the admin adds or reorders widgets in footer areas, the footer updates in real-time.
- **Auth state:** `useAuth()` from the auth system provides reactive `isLoading`, `user`, `signIn()`, `signOut()` state.

### Provider Stack (Website App)

```
<ConvexProvider client={convexClient}>
  <AuthKitProvider>       {/* @auth/authkit-tanstack-react-start/client */}
    <html>
      <head>
        <ThemeStyleInjector />  {/* Injects CSS custom properties from the active theme */}
      </head>
      <body>
        <Outlet />        {/* _marketing or _dashboard layout route */}
      </body>
    </html>
  </AuthKitProvider>
</ConvexProvider>
```

### SSR Considerations

The website app uses TanStack Start with SSR:

- **Public pages are SSR'd** for SEO. The layout must render correctly server-side.
- **Convex queries in SSR:** TanStack Start can use Convex queries in route loaders for initial data. Subsequent updates come via client-side subscriptions.
- **Auth in SSR:** `getAuth()` from `@auth/authkit-tanstack-react-start` checks auth server-side. Used in `_dashboard.tsx` loader to redirect unauthenticated users.
- **Menu data:** Can be fetched server-side in layout route loaders for faster first paint, then kept reactive client-side.
- **Progressive enhancement:** Navigation links should be standard `<a>` elements (via TanStack Router `<Link>`) that work without JavaScript.

---

## TypeScript Types

### Layout State Types

```typescript
// ConvexPress-Website/apps/web/src/lib/layout/types.ts

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
```

### Admin Bar Types

```typescript
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
```

---

## Component Inventory

### Core Layout Components

#### `LayoutShellProvider`

**File:** `ConvexPress-Website/apps/web/src/components/layout/LayoutShellProvider.tsx`
**Purpose:** React context provider for website layout state (mobile nav, search overlay, scroll state, back-to-top visibility).

**Props:**
```typescript
interface LayoutShellProviderProps {
  children: React.ReactNode;
}
```

**State Management:** `useReducer` with `LayoutShellState` + `LayoutShellActions`
**Scroll Tracking:** `useEffect` with `scroll` event listener on `window`, debounced via `requestAnimationFrame`. Sets `isScrolled` (true when `scrollY > headerHeight`) and `showBackToTop` (true when `scrollY > 600px`).
**Base UI Dependencies:** None (pure React context)

---

#### `_marketing.tsx` (Layout Route)

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing.tsx`
**Purpose:** TanStack Start layout route. Wraps all public marketing pages with the site header, optional sidebar, and footer.

**Loader:**
```typescript
loader: async () => {
  // Optionally prefetch site settings and menu data server-side for SSR
  return {};
}
```

**Component Structure:**
```tsx
function MarketingLayout() {
  const siteIdentity = useQuery(api.settings.getPublic);
  const headerMenu = useQuery(api.menus.getMenuForLocation, { location: "header" });
  const layoutConfig = useLayoutConfig();

  return (
    <LayoutShellProvider>
      <SkipToContent />
      <WebsiteAdminBar />
      <SiteHeader
        siteIdentity={siteIdentity}
        menu={headerMenu}
        layoutConfig={layoutConfig}
      />
      <MobileNav menu={headerMenu} siteIdentity={siteIdentity} />
      <div className="flex flex-1 flex-col">
        <ContentWrapper layoutConfig={layoutConfig}>
          <Outlet />
        </ContentWrapper>
      </div>
      <SiteFooter />
    </LayoutShellProvider>
  );
}
```

**Base UI Dependencies:** None

---

#### `_dashboard.tsx` (Layout Route)

**File:** `ConvexPress-Website/apps/web/src/routes/_dashboard.tsx`
**Purpose:** TanStack Start layout route for authenticated user dashboard pages. Provides a header, dashboard sidebar with user navigation, and a simplified footer.

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (!user) {
    throw redirect({ to: "/login", search: { returnTo: "/dashboard" } });
  }
  return {};
}
```

**Component Structure:**
```tsx
function DashboardLayout() {
  const siteIdentity = useQuery(api.settings.getPublic);
  const headerMenu = useQuery(api.menus.getMenuForLocation, { location: "header" });

  return (
    <LayoutShellProvider>
      <SkipToContent />
      <SiteHeader
        siteIdentity={siteIdentity}
        menu={headerMenu}
      />
      <MobileNav menu={headerMenu} siteIdentity={siteIdentity} />
      <div className="flex flex-1">
        <DashboardSidebar />
        <main id="main-content" role="main" className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <SiteFooter variant="minimal" />
    </LayoutShellProvider>
  );
}
```

**Auth:** Requires authentication. Loader uses `getAuth()` from `@auth/authkit-tanstack-react-start` and redirects unauthenticated users to `/login`.

**Base UI Dependencies:** None

---

### Header Components

#### `SiteHeader`

**File:** `ConvexPress-Website/apps/web/src/components/layout/SiteHeader.tsx`
**Purpose:** Top-level site header containing the logo/brand, primary navigation, search toggle, and user menu or login link.

**Props:**
```typescript
interface SiteHeaderProps {
  siteIdentity: SiteIdentity | undefined;
  menu: ResolvedMenu | undefined;
  layoutConfig?: LayoutConfig;
}
```

**Responsibilities:**
- Render the site logo and title (from `siteIdentity`)
- Render the `DesktopNav` with the header menu
- Render `HeaderActions` with search toggle and user menu
- Show hamburger menu button on mobile
- Apply sticky header behavior based on `layoutConfig.stickyHeader`
- Responsive: full nav on `lg+`, hamburger on smaller viewports

**UI Structure:**
```
+----------------------------------------------------------+
| [Hamburger ≡] [Logo / Site Title]    [Nav Items...]  [🔍] [User/Login] |
+----------------------------------------------------------+
```

**Sticky Behavior:**
- Default: `sticky top-0 z-40` -- header stays at top during scroll
- When `isScrolled` is true: add subtle `shadow-sm` and `bg-background/95 backdrop-blur-sm` for visual depth
- Admin bar sits above the header when visible

**CSS Variables Used:** `bg-background`, `text-foreground`, `border-border`
**Height:** `64px` on desktop (`h-16`), `56px` on mobile (`h-14`)
**Base UI Dependencies:** None

---

#### `SiteBrand`

**File:** `ConvexPress-Website/apps/web/src/components/layout/SiteBrand.tsx`
**Purpose:** Logo image and/or site title text, linking to the homepage.

**Props:**
```typescript
interface SiteBrandProps {
  siteIdentity: SiteIdentity | undefined;
  className?: string;
}
```

**Responsibilities:**
- Render site logo `<img>` if `logoUrl` exists, with `logoAlt` as alt text
- Render site title as text if no logo or if `showTitleWithLogo` is true
- Fallback to text site title when logo is not configured
- Entire brand element links to `/` (homepage)
- Loading state: show skeleton while `siteIdentity` is undefined

**Styling:**
- Logo: `h-8 w-auto` (32px height, auto width)
- Title text: `text-sm font-semibold text-foreground`
**Base UI Dependencies:** None

---

#### `DesktopNav`

**File:** `ConvexPress-Website/apps/web/src/components/layout/DesktopNav.tsx`
**Purpose:** Horizontal navigation bar with dropdown submenus for desktop viewports. Hidden on mobile.

**Props:**
```typescript
interface DesktopNavProps {
  menu: ResolvedMenu | undefined;
  className?: string;
}
```

**Responsibilities:**
- Render top-level menu items as horizontal links
- Items with children render a dropdown on hover/focus
- Dropdown submenus support up to 5 levels of nesting (per Menu System spec)
- Filter out orphaned items (`isOrphaned: true`)
- Active state based on current route matching the item's URL
- Keyboard accessible: Tab navigation, Enter/Space to open dropdowns, Escape to close

**UI Structure:**
```
[Home]  [Blog ▾]  [About]  [Contact]
            |
            +-- [Category A]
            +-- [Category B ▸]
            |         +-- [Sub-item 1]
            |         +-- [Sub-item 2]
            +-- [Category C]
```

**Dropdown Behavior:**
- Opens on hover (with 150ms delay to prevent flicker) and on focus
- Closes on mouse leave (with 300ms delay) and on Escape
- Nested submenus open to the right
- Dropdown uses `position: absolute` relative to parent
- Z-index: `z-50`

**Visibility:** `hidden lg:flex` -- only shown on desktop breakpoints
**CSS Variables Used:** `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`
**Base UI Dependencies:** None (CSS-based dropdowns, not Base UI Menu)

---

#### `NavDropdown`

**File:** `ConvexPress-Website/apps/web/src/components/layout/NavDropdown.tsx`
**Purpose:** Recursive dropdown submenu component for nested menu items.

**Props:**
```typescript
interface NavDropdownProps {
  items: ResolvedMenuItem[];
  depth: number;
  className?: string;
}
```

**Responsibilities:**
- Render a list of menu items with links
- If an item has children, render a nested `NavDropdown` on hover/focus
- Apply indentation or flyout positioning based on `depth`
- Maximum 5 levels of nesting

**CSS Variables Used:** `bg-popover`, `text-popover-foreground`, `ring-foreground/10`
**Styling:** `ring-1 ring-foreground/10 rounded-none shadow-md` (matches existing dropdown-menu pattern)
**Base UI Dependencies:** None

---

#### `HeaderActions`

**File:** `ConvexPress-Website/apps/web/src/components/layout/HeaderActions.tsx`
**Purpose:** Right-side header actions: search toggle button and user menu (or login link for unauthenticated visitors).

**Props:**
```typescript
interface HeaderActionsProps {
  className?: string;
}
```

**Responsibilities:**
- Search toggle button (Lucide `Search` icon)
- When authenticated: show `UserMenu` dropdown (avatar + name)
- When not authenticated: show "Sign In" link to `/login`
- Loading state: show nothing while `useAuth()` is loading

**Base UI Dependencies:** None directly (uses `DropdownMenu` from existing UI components for user menu)

---

#### `UserMenu`

**File:** `ConvexPress-Website/apps/web/src/components/layout/UserMenu.tsx`
**Purpose:** User avatar and dropdown menu in the header for authenticated users.

**Props:** None (reads from `useAuth()`)

**Dropdown Items:**
- "Dashboard" -- navigates to `/dashboard`
- "Your Profile" -- navigates to `/dashboard/profile`
- "Settings" -- navigates to `/dashboard/settings`
- Separator
- "Log Out" -- calls `signOut()` from Convex Auth

**Avatar Display:**
- Show user avatar image from `user.profilePictureUrl` if available
- Fallback to initials circle (first letter of first name + first letter of last name)
- Size: `size-8` (32px)

**CSS Variables Used:** `bg-muted`, `text-foreground`, `text-muted-foreground`
**Base UI Dependencies:** `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` (from existing `src/components/ui/dropdown-menu.tsx`)

---

#### `SearchOverlay`

**File:** `ConvexPress-Website/apps/web/src/components/layout/SearchOverlay.tsx`
**Purpose:** Full-width search input overlay that slides down from the header when the search toggle is clicked.

**Props:** None (reads from `LayoutShellContext`)

**Responsibilities:**
- Render a full-width input field below the header
- Auto-focus the input on open
- On submit: navigate to `/search?q={query}`
- Close on Escape key or close button click
- Animate slide-down from top

**Styling:**
- Background: `bg-background` with `border-b border-border`
- Input: full width, uses existing `Input` component
- Close button: Lucide `X` icon

**Base UI Dependencies:** `Input` (from `@base-ui/react/input` via existing Input component)

---

### Mobile Navigation Components

#### `MobileNav`

**File:** `ConvexPress-Website/apps/web/src/components/layout/MobileNav.tsx`
**Purpose:** Mobile navigation overlay shown when the hamburger menu button is clicked. Slides in from the left with a backdrop.

**Props:**
```typescript
interface MobileNavProps {
  menu: ResolvedMenu | undefined;
  siteIdentity: SiteIdentity | undefined;
}
```

**Responsibilities:**
- Render a backdrop + slide-in panel when `mobileNavOpen` is true
- Panel slides in from the left (240px width)
- Contains: site brand at top, full menu tree (accordion-style for nested items), user actions at bottom
- Backdrop click or Escape key closes the overlay
- Focus trapped inside the overlay when open
- `aria-hidden="true"` on the rest of the page when open
- Close on route change (watch `router.state.location`)

**Panel Structure:**
```
+-----------------------------------+
| [Logo / Site Title]         [X]  |
+-----------------------------------+
| Home                              |
| Blog                         [▾] |
|   Category A                      |
|   Category B                      |
|   Category C                      |
| About                             |
| Contact                           |
+-----------------------------------+
| [Sign In] or [User Avatar + Name] |
| [Dashboard]  [Profile]  [Log Out] |
+-----------------------------------+
```

**Nested Items:** Use accordion-style toggle (tap parent to expand/collapse children) rather than flyout submenus.
**Visibility:** Only rendered on `< lg` viewports.
**Z-Index:** Backdrop `z-50`, panel `z-50`
**CSS Variables Used:** `bg-background`, `text-foreground`, `border-border`, `bg-black/50` (backdrop)
**Base UI Dependencies:** None (or `Dialog` from `@base-ui/react/dialog` for accessibility)

---

#### `MobileNavItem`

**File:** `ConvexPress-Website/apps/web/src/components/layout/MobileNavItem.tsx`
**Purpose:** A single navigation item in the mobile nav, with accordion toggle for items with children.

**Props:**
```typescript
interface MobileNavItemProps {
  item: ResolvedMenuItem;
  depth: number;
  onNavigate: () => void;  // Called on link click to close mobile nav
}
```

**Responsibilities:**
- Render link text with appropriate left padding based on `depth`
- If item has children: show expand/collapse chevron, toggle children visibility on tap
- Active state styling based on current route
- On link click: call `onNavigate()` to close the mobile nav

**Base UI Dependencies:** None

---

### Footer Components

#### `SiteFooter`

**File:** `ConvexPress-Website/apps/web/src/components/layout/SiteFooter.tsx`
**Purpose:** Site-wide footer with widget areas, footer navigation, copyright notice, and social links.

**Props:**
```typescript
interface SiteFooterProps {
  variant?: "full" | "minimal";  // "minimal" for dashboard layout
}
```

**Responsibilities:**
- **Full variant:** Footer widget areas (3 columns by default), footer navigation, copyright + social links
- **Minimal variant:** Copyright line only (used in dashboard layout)
- Fetch footer menu via Convex query
- Fetch social links menu via Convex query
- Render widget areas via `<WidgetArea>` component

**UI Structure (Full):**
```
+----------------------------------------------------------+
| [Footer Widget 1]  [Footer Widget 2]  [Footer Widget 3] |
+----------------------------------------------------------+
| [Footer Nav: About | Privacy | Terms | Contact]          |
+----------------------------------------------------------+
| (c) 2025 Site Title. All rights reserved.    [Social Icons] |
+----------------------------------------------------------+
```

**CSS Variables Used:** `bg-muted/30`, `text-muted-foreground`, `border-border`, `text-foreground`
**Base UI Dependencies:** None

---

#### `FooterWidgetAreas`

**File:** `ConvexPress-Website/apps/web/src/components/layout/FooterWidgetAreas.tsx`
**Purpose:** Renders the footer widget area columns.

**Props:**
```typescript
interface FooterWidgetAreasProps {
  columns?: 1 | 2 | 3 | 4;
}
```

**Responsibilities:**
- Render 1-4 `<WidgetArea>` components side by side in a responsive grid
- Slugs: `footer-1`, `footer-2`, `footer-3`, `footer-4`
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-{columns}`
- If a widget area has no widgets, do not render that column

**Base UI Dependencies:** None

---

#### `FooterNav`

**File:** `ConvexPress-Website/apps/web/src/components/layout/FooterNav.tsx`
**Purpose:** Horizontal footer navigation links from the "footer" menu location.

**Props:** None (fetches from Convex)

**Responsibilities:**
- Fetch menu from `api.menus.getMenuForLocation` with `location: "footer"`
- Render as a horizontal list of links (no dropdowns in footer)
- Separator between items: `|` or `border-r`

**Styling:** `text-xs text-muted-foreground hover:text-foreground`
**Base UI Dependencies:** None

---

#### `FooterBottom`

**File:** `ConvexPress-Website/apps/web/src/components/layout/FooterBottom.tsx`
**Purpose:** Bottom-most footer row with copyright and social links.

**Props:**
```typescript
interface FooterBottomProps {
  siteTitle: string;
}
```

**Responsibilities:**
- Left: Copyright text -- "(c) {year} {siteTitle}. All rights reserved."
- Right: Social links icons (from "social" menu location)
- Social link icons rendered using Lucide icons matched to platform names

**Base UI Dependencies:** None

---

#### `SocialLinks`

**File:** `ConvexPress-Website/apps/web/src/components/layout/SocialLinks.tsx`
**Purpose:** Renders social media icon links from the "social" menu location.

**Props:**
```typescript
interface SocialLinksProps {
  className?: string;
  iconSize?: "sm" | "md";  // sm = size-4, md = size-5
}
```

**Responsibilities:**
- Fetch social links menu from `api.menus.getMenuForLocation` with `location: "social"`
- Map item labels/URLs to platform icons (e.g., "Twitter" -> Lucide `Twitter`, "GitHub" -> `Github`)
- Open all links in new tab (`target="_blank" rel="noopener noreferrer"`)
- Show just icons (no text labels) in the footer

**Icon Mapping:**
```typescript
const SOCIAL_ICON_MAP: Record<string, LucideIcon> = {
  twitter: Twitter,
  x: Twitter,
  github: Github,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  linkedin: Linkedin,
  rss: Rss,
  // ... extend as needed
};
```

**Base UI Dependencies:** None

---

### Content Area Components

#### `ContentWrapper`

**File:** `ConvexPress-Website/apps/web/src/components/layout/ContentWrapper.tsx`
**Purpose:** Wrapper around the `<Outlet />` that provides max-width, padding, responsive breakpoints, and optional sidebar.

**Props:**
```typescript
interface ContentWrapperProps {
  layoutConfig?: LayoutConfig;
  children: React.ReactNode;
  showSidebar?: boolean;
  showBreadcrumbs?: boolean;
}
```

**Responsibilities:**
- Apply `max-width` based on `layoutConfig.contentMaxWidth`
- Center content with `mx-auto`
- Apply padding: `px-4 md:px-6 lg:px-8`
- Render sidebar if `sidebarPosition` is not "none"
- Sidebar position: flex order based on "left" or "right"
- Render breadcrumbs at the top if `showBreadcrumbs` is true

**Max Width Map:**
```typescript
const MAX_WIDTH_MAP = {
  sm: "max-w-3xl",    // ~768px
  md: "max-w-4xl",    // ~896px
  lg: "max-w-5xl",    // ~1024px
  xl: "max-w-6xl",    // ~1152px
  full: "max-w-full", // no max
};
```

**Base UI Dependencies:** None

---

#### `Sidebar`

**File:** `ConvexPress-Website/apps/web/src/components/layout/Sidebar.tsx`
**Purpose:** Optional sidebar rendering widget area content.

**Props:**
```typescript
interface SidebarProps {
  widgetAreaSlug?: string;  // Default: "sidebar-1"
  position?: "left" | "right";
  className?: string;
}
```

**Responsibilities:**
- Render `<WidgetArea>` component with the specified slug
- Width: `w-64 lg:w-72` (256-288px)
- Hidden on mobile: `hidden lg:block`
- Sticky: `sticky top-20` (below sticky header)

**CSS Variables Used:** `border-border` (left or right border depending on position)
**Base UI Dependencies:** None

---

#### `WidgetArea`

**File:** `ConvexPress-Website/apps/web/src/components/layout/WidgetArea.tsx`
**Purpose:** Renders all widget instances assigned to a specific widget area. This is the website-side counterpart to the admin's widget management UI.

**Props:**
```typescript
interface WidgetAreaProps {
  slug: string;           // Widget area slug (e.g., "sidebar-1", "footer-1")
  className?: string;
}
```

**Responsibilities:**
- Fetch widget instances via `useQuery(api.widgets.getAreaWidgets, { slug })`
- Map each instance to its render component using the Widget Type Registry
- Render instances in order
- Show nothing if no widgets are assigned (no empty state)
- Each widget wrapped in a consistent container with spacing

**Base UI Dependencies:** None

---

#### `Breadcrumbs`

**File:** `ConvexPress-Website/apps/web/src/components/layout/Breadcrumbs.tsx`
**Purpose:** Breadcrumb trail showing the navigation hierarchy for the current page.

**Props:**
```typescript
interface BreadcrumbsProps {
  segments?: BreadcrumbSegment[];  // Override auto-generated segments
  className?: string;
}
```

**Responsibilities:**
- Auto-generate breadcrumbs from current TanStack Start route matches (if no override)
- First segment: "Home" linking to `/`
- Last segment: plain text (no link), represents current page
- Segments separated by `ChevronRight` icon
- Structured data: output JSON-LD `BreadcrumbList` schema for SEO

**Data Source:** Route-based by default. Content pages (posts, pages) may provide content-hierarchy overrides via route loader data (e.g., Category > Subcategory > Post Title).

**Accessibility:**
```html
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li aria-hidden="true"> > </li>
    <li><a href="/blog">Blog</a></li>
    <li aria-hidden="true"> > </li>
    <li aria-current="page">My Post Title</li>
  </ol>
</nav>
```

**CSS Variables Used:** `text-muted-foreground`, `text-foreground`, `hover:text-foreground`
**Styling:** `text-xs` font size, links are `text-muted-foreground hover:text-foreground`
**Base UI Dependencies:** None

---

### Admin Bar Component

#### `WebsiteAdminBar`

**File:** `ConvexPress-Website/apps/web/src/components/layout/WebsiteAdminBar.tsx`
**Purpose:** Thin bar at the very top of the page, visible only to logged-in administrators. Provides quick links to the admin panel and "Edit This Page" for the current content.

**Props:** None (reads from `useAuth()` and current route context)

**Responsibilities:**
- Only render when `user` exists AND user has administrator capabilities
- Check capabilities via a lightweight Convex query (`api.users.hasCapability`)
- Items: "Admin Dashboard" (link to admin app), "Edit This Page" (link to edit route for current content)
- "Edit This Page" only shows on post/page routes where the content ID is available from route params
- Fixed height: `32px` (`h-8`)
- Sits above the SiteHeader, pushing everything down

**UI Structure:**
```
+----------------------------------------------------------+
| [ConvexPress] [Dashboard]        [Edit This Page] [🔗]   |
+----------------------------------------------------------+
```

**CSS Variables Used:** `bg-foreground`, `text-background` (inverted colors for high contrast admin bar)
**Styling:** Dark background with light text (uses `bg-foreground text-background` to invert the theme)
**Base UI Dependencies:** None

---

### Utility Components

#### `SkipToContent`

**File:** `ConvexPress-Website/apps/web/src/components/layout/SkipToContent.tsx`
**Purpose:** Visually hidden link that becomes visible on focus, allowing keyboard users to skip navigation and jump to main content.

**Props:** None

**Implementation:**
```tsx
function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:text-xs focus:font-medium"
    >
      Skip to main content
    </a>
  );
}
```

**Base UI Dependencies:** None

---

#### `BackToTop`

**File:** `ConvexPress-Website/apps/web/src/components/layout/BackToTop.tsx`
**Purpose:** Floating button that appears after scrolling down, scrolling the user back to the top of the page on click.

**Props:** None (reads `showBackToTop` from `LayoutShellContext`)

**Responsibilities:**
- Only visible when `showBackToTop` is true (user has scrolled > 600px)
- Positioned: `fixed bottom-6 right-6 z-30`
- Smooth scroll to top on click: `window.scrollTo({ top: 0, behavior: "smooth" })`
- Fade in/out animation
- Icon: Lucide `ArrowUp`

**Styling:** `bg-primary text-primary-foreground size-10 rounded-none shadow-md`
**Accessibility:** `aria-label="Back to top"`
**Base UI Dependencies:** Button (from `@base-ui/react/button` via existing Button component)

---

#### `ThemeStyleInjector`

**File:** `ConvexPress-Website/apps/web/src/components/layout/ThemeStyleInjector.tsx`
**Purpose:** Injects CSS custom properties from the theme configuration into a `<style>` tag in the document head.

**Props:** None (fetches from Convex)

**Responsibilities:**
- Subscribe to `useQuery(api.themes.getGlobalStyles)` for compiled CSS custom property string
- Inject into a `<style>` tag that overrides the default `:root` variables
- Handles undefined/loading state (does nothing until data loads)

**Note:** This component may need to be placed inside `__root.tsx` rather than a layout route, so that theme styles apply globally. However, since the existing `__root.tsx` already provides the HTML `<head>`, the injector should render a `<style>` element inside the body that uses CSS custom property overrides (which cascade correctly regardless of DOM position).

**Base UI Dependencies:** None

---

### Dashboard Sidebar Component

#### `DashboardSidebar`

**File:** `ConvexPress-Website/apps/web/src/components/layout/DashboardSidebar.tsx`
**Purpose:** Vertical navigation sidebar for the authenticated user dashboard.

**Props:** None

**Nav Items:**
```typescript
const DASHBOARD_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, exact: true },
  { id: "posts", label: "My Posts", to: "/dashboard/posts", icon: FileText },
  { id: "profile", label: "Profile", to: "/dashboard/profile", icon: User },
  { id: "notifications", label: "Notifications", to: "/dashboard/notifications", icon: Bell },
  { id: "settings", label: "Settings", to: "/dashboard/settings", icon: Settings },
];
```

**Responsibilities:**
- Render vertical nav items with icons and labels
- Active state using TanStack Router `<Link>` `activeProps`
- Hidden on mobile: `hidden md:flex` (mobile users see top-level tabs or a bottom bar)
- Width: `w-56` (224px)
- Sticky: `sticky top-16` (below the header)

**CSS Variables Used:** `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`
**Base UI Dependencies:** None

---

## Hooks

### `useLayoutShell`

**File:** `ConvexPress-Website/apps/web/src/hooks/layout/useLayoutShell.ts`

```typescript
interface UseLayoutShellResult extends LayoutShellState, LayoutShellActions {}

function useLayoutShell(): UseLayoutShellResult
```

**Purpose:** Access layout shell context (state + actions).
**Usage:**
```typescript
const { mobileNavOpen, toggleMobileNav, closeMobileNav, isScrolled } = useLayoutShell();
```

---

### `useLayoutConfig`

**File:** `ConvexPress-Website/apps/web/src/hooks/layout/useLayoutConfig.ts`

```typescript
function useLayoutConfig(): LayoutConfig | undefined
```

**Purpose:** Derive layout configuration from the active theme.
**Behavior:**
- Calls `useQuery(api.themes.getActive)` from Convex
- Extracts layout-relevant settings (content width, sidebar position, header style, footer columns, sticky header)
- Returns a `LayoutConfig` object or `undefined` while loading
- Provides sensible defaults if theme has no explicit layout config

**Defaults:**
```typescript
const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  contentMaxWidth: "lg",
  sidebarPosition: "right",
  sidebarWidgetArea: "sidebar-1",
  headerStyle: "default",
  footerColumns: 3,
  stickyHeader: true,
};
```

---

### `useSiteIdentity`

**File:** `ConvexPress-Website/apps/web/src/hooks/layout/useSiteIdentity.ts`

```typescript
function useSiteIdentity(): SiteIdentity | undefined
```

**Purpose:** Fetch site identity settings (title, tagline, logo).
**Behavior:**
- Calls `useQuery(api.settings.getPublic)` from Convex
- Extracts site_title, site_tagline, site_logo_url fields
- Returns a `SiteIdentity` object or `undefined` while loading
- Reactive: updates in real-time when admin changes settings

---

### `useMenuForLocation`

**File:** `ConvexPress-Website/apps/web/src/hooks/layout/useMenuForLocation.ts`

```typescript
function useMenuForLocation(location: string): ResolvedMenu | undefined
```

**Purpose:** Fetch the menu assigned to a specific theme location.
**Behavior:**
- Calls `useQuery(api.menus.getMenuForLocation, { location })`
- Returns the full resolved menu tree or `undefined` while loading
- Filters out orphaned items client-side (as a safety net -- server should already filter)
- Reactive: updates when admin edits menu

---

### `useScrollState`

**File:** `ConvexPress-Website/apps/web/src/hooks/layout/useScrollState.ts`

```typescript
interface ScrollState {
  isScrolled: boolean;       // scrollY > threshold (default: 10px)
  showBackToTop: boolean;    // scrollY > 600px
  scrollY: number;
}

function useScrollState(threshold?: number): ScrollState
```

**Purpose:** Track scroll position for sticky header effects and back-to-top button visibility.
**Behavior:**
- Attaches a `scroll` event listener on `window`
- Uses `requestAnimationFrame` for performance
- Returns computed booleans based on thresholds
- Cleans up listener on unmount

---

### `useBreadcrumbs`

**File:** `ConvexPress-Website/apps/web/src/hooks/layout/useBreadcrumbs.ts`

```typescript
function useBreadcrumbs(overrides?: BreadcrumbSegment[]): BreadcrumbSegment[]
```

**Purpose:** Auto-generate or override breadcrumb segments for the current route.
**Behavior:**
- Uses `useMatches()` from TanStack Start to get the current route match chain
- Maps route segments to human-readable labels using a lookup map
- Dynamic segments (e.g., `$slug`) resolved from route `loaderData`
- Always starts with `{ label: "Home", to: "/" }`
- Overrides replace the auto-generated breadcrumbs entirely

---

### `useAdminBarVisibility`

**File:** `ConvexPress-Website/apps/web/src/hooks/layout/useAdminBarVisibility.ts`

```typescript
function useAdminBarVisibility(): {
  showAdminBar: boolean;
  isAdmin: boolean;
  editUrl: string | null;  // Admin edit URL for current content
}
```

**Purpose:** Determine whether the admin bar should be shown and provide the "Edit This Page" URL.
**Behavior:**
- Checks `useAuth()` for authenticated user
- Calls `useQuery(api.users.hasCapability, { capability: "manage_options" })` to check admin status
- Derives edit URL from current route params (e.g., post slug -> admin edit URL)
- Returns `showAdminBar: false` when not admin or not authenticated

---

## Backend Integration

**CRITICAL: This system NEVER defines its own Convex queries or mutations.** All backend data is consumed from other systems' existing queries.

### Convex Queries Consumed

| Query | Source System | Used By | Purpose |
|-------|-------------|---------|---------|
| `api.settings.getPublic` | Settings System | `useSiteIdentity`, `SiteHeader`, `SiteFooter` | Site title, tagline, logo URL, homepage display mode |
| `api.themes.getActive` | theme configuration | `useLayoutConfig`, `ThemeStyleInjector` | Active theme configuration for layout and CSS variables |
| `api.themes.getGlobalStyles` | theme configuration | `ThemeStyleInjector` | Compiled CSS custom properties string |
| `api.menus.getMenuForLocation` | Menu System | `useMenuForLocation`, `SiteHeader`, `SiteFooter`, `SocialLinks` | Resolved menu trees for header, footer, social, mobile locations |
| `api.widgets.getAreaWidgets` | widgets | `WidgetArea` | Widget instances for sidebar and footer areas |
| `api.users.hasCapability` | Role & Capability System | `useAdminBarVisibility` | Check if current user is an administrator (for admin bar) |
| `api.users.getCurrentUser` | User Profile System | `UserMenu` | User display name, avatar for header user menu |

### Convex Mutations Used

| Mutation | Used By | Purpose |
|----------|---------|---------|
| None | -- | This is a read-only UI system. All interactions are navigation (handled by router) or auth actions (handled by the auth system). |

### Convex Auth APIs Used

| API | Used By | Import From |
|-----|---------|-------------|
| `getAuth()` | `_dashboard.tsx` loader | `@auth/authkit-tanstack-react-start` |
| `useAuth()` | `HeaderActions`, `UserMenu`, `WebsiteAdminBar`, `MobileNav` | `@auth/authkit-tanstack-react-start/client` |

---

## Accessibility

### ARIA Landmarks

```html
<!-- Layout structure with ARIA landmarks -->
<body>
  <a href="#main-content" class="sr-only focus:not-sr-only">
    Skip to main content
  </a>

  <!-- Admin bar (when visible) -->
  <div role="complementary" aria-label="Admin toolbar">
    ...
  </div>

  <!-- Site header -->
  <header role="banner">
    <nav aria-label="Primary navigation">
      <ul role="list">
        <li>
          <a href="/blog" aria-current="page">Blog</a>
          <ul role="list" aria-label="Blog submenu">
            <li><a href="/blog/category-a">Category A</a></li>
          </ul>
        </li>
      </ul>
    </nav>
  </header>

  <!-- Mobile nav overlay -->
  <div role="dialog" aria-modal="true" aria-label="Navigation menu">
    <nav aria-label="Mobile navigation">...</nav>
  </div>

  <!-- Content area -->
  <div>
    <nav aria-label="Breadcrumb">
      <ol>...</ol>
    </nav>
    <main id="main-content" role="main">
      <!-- Outlet renders here -->
    </main>
    <aside role="complementary" aria-label="Sidebar">
      <!-- Widget areas -->
    </aside>
  </div>

  <!-- Site footer -->
  <footer role="contentinfo">
    <nav aria-label="Footer navigation">...</nav>
  </footer>
</body>
```

### Keyboard Navigation

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Header nav | Move between nav items and header actions |
| `Enter` / `Space` | Nav item with children | Open dropdown submenu |
| `Escape` | Open dropdown | Close dropdown submenu |
| `Escape` | Mobile nav overlay | Close mobile navigation |
| `Escape` | Search overlay | Close search and return focus to search toggle |
| `Arrow Down` | Open dropdown | Move to next dropdown item |
| `Arrow Up` | Open dropdown | Move to previous dropdown item |
| `Arrow Right` | Nested dropdown trigger | Open nested submenu |
| `Arrow Left` | Inside nested submenu | Close nested submenu, return to parent |
| `Home` | Open dropdown | Move to first item |
| `End` | Open dropdown | Move to last item |
| `Tab` | Mobile nav | Move between mobile nav items |
| `Enter` / `Space` | Mobile nav item with children | Toggle accordion expand/collapse |

### Focus Management

- **Mobile nav open:** Focus is trapped inside the overlay. First focusable element receives focus on open. Focus returns to hamburger button on close.
- **Search overlay open:** Focus moves to search input on open. Focus returns to search toggle on close.
- **Route change:** Focus moves to `#main-content` (or the page heading) for screen readers. Consider announcing page title via `aria-live` region.
- **Dropdown menus:** Focus returns to trigger element when dropdown closes.

### Color Contrast

- All text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)
- Navigation links must be distinguishable without relying solely on color (underline on hover, active indicator)
- Admin bar uses inverted colors (`bg-foreground text-background`) for clear differentiation from page content

---

## Styling Patterns

### CSS Variable Usage

The website layout uses the standard CSS variables defined in `index.css`:

| Variable | Usage |
|----------|-------|
| `--background` | Page background, header background |
| `--foreground` | Primary text color |
| `--card` | Card/section backgrounds |
| `--card-foreground` | Card text |
| `--muted` | Subtle backgrounds, footer background |
| `--muted-foreground` | Secondary text, breadcrumb links |
| `--popover` | Dropdown backgrounds |
| `--popover-foreground` | Dropdown text |
| `--primary` | CTAs, active indicators, back-to-top button |
| `--primary-foreground` | Text on primary backgrounds |
| `--border` | Borders, dividers |
| `--accent` | Hover states |
| `--accent-foreground` | Hover state text |
| `--destructive` | Error states |

**CRITICAL:** Never use hardcoded color names like `zinc-900`, `slate-500`, `gray-200`, etc. Always use CSS variable-based classes (`bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, etc.) or opacity modifiers on CSS variables (`bg-muted/50`, `bg-black/40`).

### Layout Dimensions

| Element | Size | Notes |
|---------|------|-------|
| Header height (desktop) | `64px` (`h-16`) | Sticky, above content |
| Header height (mobile) | `56px` (`h-14`) | Sticky |
| Admin bar height | `32px` (`h-8`) | Only for admins, sits above header |
| Footer padding | `py-8 lg:py-12` | Generous spacing |
| Content max-width | `max-w-5xl` default | Configurable via theme |
| Sidebar width | `w-64 lg:w-72` | 256-288px |
| Dashboard sidebar | `w-56` | 224px |
| Mobile nav width | `w-72` | 288px |
| Content padding | `px-4 md:px-6 lg:px-8` | Responsive horizontal padding |
| Content vertical padding | `py-6 lg:py-8` | Responsive vertical padding |

### Z-Index Stack

| Element | Z-Index | Notes |
|---------|---------|-------|
| Back-to-top button | `z-30` | Below navigation |
| Header | `z-40` | Above content, below overlays |
| Dropdown menus | `z-50` | Above header |
| Mobile nav backdrop | `z-50` | Above everything |
| Mobile nav panel | `z-50` | Same as backdrop |
| Search overlay | `z-40` | Same level as header |
| Admin bar | `z-50` | Above everything on the page |
| Skip-to-content | `z-[100]` | Above everything when focused |

### Responsive Breakpoints

| Breakpoint | Header | Navigation | Sidebar | Footer |
|------------|--------|------------|---------|--------|
| `< 640px` (mobile) | Hamburger + logo + user | Mobile overlay only | Hidden | Single column widgets |
| `640px - 767px` (sm) | Hamburger + logo + user | Mobile overlay only | Hidden | Single column widgets |
| `768px - 1023px` (md) | Hamburger + logo + partial nav + user | Mobile overlay + partial desktop | Hidden (or collapsed) | 2-column widgets |
| `>= 1024px` (lg) | Full logo + full nav + all actions | Full desktop nav with dropdowns | Visible | 3-column widgets |
| `>= 1280px` (xl) | Same as lg, wider spacing | Same as lg | Full width sidebar | Same as lg |

---

## Routes

### `_marketing.tsx` Layout Route

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing.tsx`
**Auth:** Public (no authentication required)
**SSR:** Yes -- SSR for SEO. Optionally prefetch menu/settings in loader.

```typescript
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  // Data fetching via Convex hooks (reactive)
  // Layout rendering: LayoutShellProvider > SkipToContent > AdminBar > Header > MobileNav > ContentWrapper > Outlet > Footer

  return (
    <LayoutShellProvider>
      <SkipToContent />
      <WebsiteAdminBar />
      <SiteHeader ... />
      <MobileNav ... />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
      <SiteFooter variant="full" />
      <BackToTop />
    </LayoutShellProvider>
  );
}
```

---

### `_dashboard.tsx` Layout Route

**File:** `ConvexPress-Website/apps/web/src/routes/_dashboard.tsx`
**Auth:** Required -- redirects unauthenticated users to `/login`
**SSR:** Yes -- loader calls `getAuth()` for server-side redirect

```typescript
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuth } from "@auth/authkit-tanstack-react-start";

export const Route = createFileRoute("/_dashboard")({
  loader: async () => {
    const { user } = await getAuth();
    if (!user) {
      throw redirect({ to: "/login", search: { returnTo: "/dashboard" } });
    }
    return {};
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <LayoutShellProvider>
      <SkipToContent />
      <SiteHeader ... />
      <MobileNav ... />
      <div className="flex flex-1">
        <DashboardSidebar />
        <main id="main-content" role="main" className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <SiteFooter variant="minimal" />
    </LayoutShellProvider>
  );
}
```

---

## Known Gaps & Decisions

### 1. Dashboard Layout Sidebar Design

**Gap:** Full sidebar with text labels vs mini icon-only sidebar on desktop?

**Current Decision:** Start with a full sidebar (`w-56`) showing icons + text labels. On smaller desktop viewports (`md`), the sidebar is hidden and replaced by a horizontal tab bar or the mobile nav. Mini icon sidebar is a possible future enhancement.

**Recommendation:** Full sidebar for v1. The dashboard has relatively few nav items (5-7), so a full sidebar provides clarity without wasting too much space.

### 2. Mobile Navigation Animation

**Gap:** Slide-in from left vs overlay from top?

**Current Decision:** Slide-in from left with backdrop overlay. This is the most common mobile navigation pattern and matches user expectations.

**Recommendation:** Left slide-in. Slide-in from top is less standard and can conflict with sticky header behavior.

### 3. Mega Menu Support

**Gap:** The theme configuration deferred mega menu support. Some sites need multi-column dropdown menus for complex navigation.

**Current Decision:** Not in v1. Standard single-column dropdown submenus are sufficient. Mega menus can be added later as a special menu item type or layout option.

**Recommendation:** Defer. Standard dropdowns cover the vast majority of use cases. Mega menus add significant complexity.

### 4. Sticky Header Behavior

**Gap:** Always sticky vs scroll-up reveal (header hides on scroll down, reappears on scroll up)?

**Current Decision:** Always sticky (`sticky top-0`). Simple, predictable behavior.

**Alternative:** Scroll-up reveal pattern (popular on content-heavy sites to maximize reading area). Would require `useScrollDirection()` hook.

**Recommendation:** Always sticky for v1. Add scroll-up reveal as a theme configuration option later.

### 5. Dark Mode Toggle

**Gap:** Where does the dark mode toggle live? Header? Footer? Settings?

**Current Decision:** Deferred. The website currently uses `className="dark"` hardcoded on the `<html>` element. A proper dark mode toggle needs theme configuration integration.

**Recommendation:** Add a toggle button in `HeaderActions` that persists to `localStorage` and syncs with a `theme-mode` CSS class on `<html>`. Implement after theme configuration is built.

### 6. Footer Widget Area Column Layout

**Gap:** Auto-determine columns from how many areas have widgets, or make it configurable?

**Current Decision:** Configurable via the theme configuration `layoutConfig.footerColumns` (1-4). Default is 3.

**Recommendation:** Configurable. Auto-detection can cause jarring layout shifts when widgets are added/removed in real-time.

### 7. Breadcrumb Data Source

**Gap:** Route-based vs content hierarchy?

**Current Decision:** Route-based by default with content-hierarchy overrides. Route segments are mapped to labels. Content pages (posts, pages) can provide richer breadcrumbs via route loader data.

**Recommendation:** Hybrid approach. Route-based covers most cases. Content pages enhance with category hierarchy when available.

### 8. Page Transition Library

**Gap:** View Transitions API vs framer-motion vs CSS only?

**Current Decision:** CSS transitions only for v1. TanStack Start supports the View Transitions API experimentally, but browser support is still limited.

**Recommendation:** CSS-only for v1 (fade transitions on route change). Consider View Transitions API when browser support improves. Avoid adding framer-motion as a dependency.

### 9. Header/Footer in __root.tsx vs Layout Routes

**Gap:** The current codebase has `<Header />` rendered directly in `__root.tsx`, which means it appears on ALL routes including auth pages (login, register).

**Current Decision:** Move header and footer OUT of `__root.tsx` and INTO the `_marketing.tsx` and `_dashboard.tsx` layout routes. Auth pages should NOT show the site header/footer -- they use their own `AuthPageLayout`.

**Impact:** This requires modifying `__root.tsx` to remove the `<Header />` component and the grid layout. The root should only provide providers and the bare `<Outlet />`.

### 10. Existing Header Component Migration

**Gap:** The existing `src/components/header.tsx` is a simple placeholder with basic Sign In/Sign Out functionality. It needs to be replaced with the full `SiteHeader` system.

**Current Decision:** The existing `header.tsx` will be deprecated and replaced by the new layout component system. Auth state handling patterns from the existing header should be preserved in the new `HeaderActions` and `UserMenu` components.

**Impact:** Low risk. The existing header is minimal.

---

## Implementation Checklist

### Phase 1: Foundation (Current Priority)

**Layout Routes:**
- [ ] Create `src/routes/_marketing.tsx` -- Marketing layout route
- [ ] Create `src/routes/_dashboard.tsx` -- Dashboard layout route (with auth gate)
- [ ] Migrate `__root.tsx` to remove `<Header />` and grid layout, provide bare `<Outlet />`
- [ ] Move `src/routes/index.tsx` under `_marketing/` to become `src/routes/_marketing/index.tsx`

**Core Layout Components (`src/components/layout/`):**
- [ ] `LayoutShellProvider.tsx` -- Context provider for layout state
- [ ] `SkipToContent.tsx` -- Accessibility skip link
- [ ] `SiteHeader.tsx` -- Main site header
- [ ] `SiteBrand.tsx` -- Logo and site title
- [ ] `HeaderActions.tsx` -- Search toggle + user menu / login link
- [ ] `UserMenu.tsx` -- Authenticated user dropdown
- [ ] `ContentWrapper.tsx` -- Content area with max-width and optional sidebar
- [ ] `SiteFooter.tsx` -- Site footer with widget areas and nav
- [ ] `FooterBottom.tsx` -- Copyright and social links row

**Types and Lib:**
- [ ] `src/lib/layout/types.ts` -- TypeScript types for layout state, menu items, site identity
- [ ] `src/lib/layout/constants.ts` -- Layout dimension constants, z-index values

**Hooks (`src/hooks/layout/`):**
- [ ] `useLayoutShell.ts` -- Access layout shell context
- [ ] `useSiteIdentity.ts` -- Fetch site identity settings
- [ ] `useScrollState.ts` -- Track scroll position

### Phase 2: Navigation

**Components:**
- [ ] `DesktopNav.tsx` -- Horizontal nav with dropdown submenus
- [ ] `NavDropdown.tsx` -- Recursive dropdown submenu
- [ ] `MobileNav.tsx` -- Mobile navigation overlay
- [ ] `MobileNavItem.tsx` -- Accordion-style mobile nav item
- [ ] `FooterNav.tsx` -- Footer navigation links
- [ ] `SocialLinks.tsx` -- Social media icon links

**Hooks:**
- [ ] `useMenuForLocation.ts` -- Fetch menu for a location

### Phase 3: Content Structure

**Components:**
- [ ] `Sidebar.tsx` -- Optional sidebar with widget area
- [ ] `WidgetArea.tsx` -- Renders widget instances for a given area slug
- [ ] `FooterWidgetAreas.tsx` -- Footer widget area columns
- [ ] `Breadcrumbs.tsx` -- Breadcrumb trail component
- [ ] `DashboardSidebar.tsx` -- User dashboard vertical nav sidebar

**Hooks:**
- [ ] `useLayoutConfig.ts` -- Derive layout config from active theme
- [ ] `useBreadcrumbs.ts` -- Auto-generate or override breadcrumbs

### Phase 4: Enhancements

**Components:**
- [ ] `WebsiteAdminBar.tsx` -- Admin bar for logged-in administrators
- [ ] `BackToTop.tsx` -- Floating back-to-top button
- [ ] `SearchOverlay.tsx` -- Full-width search input overlay
- [ ] `ThemeStyleInjector.tsx` -- CSS custom property injection from the active theme

**Hooks:**
- [ ] `useAdminBarVisibility.ts` -- Admin bar visibility + edit URL logic

### Phase 5: Future Enhancements

- [ ] Dark mode toggle in `HeaderActions`
- [ ] View Transitions API for page transitions
- [ ] Mega menu support for complex navigation
- [ ] Scroll-up reveal header option
- [ ] Mini icon sidebar for dashboard layout
- [ ] Page transition loading indicator

---

## Edge Cases & Gotchas

1. **Header in __root.tsx conflict:** The existing `__root.tsx` renders `<Header />` globally. Before implementing layout routes, the `<Header />` and its wrapping grid must be removed from `__root.tsx`. Otherwise, the site will render two headers on layout-route pages and an unwanted header on auth pages.

2. **Route nesting migration:** Existing routes (`index.tsx`, `login.tsx`) are top-level. When `_marketing.tsx` is introduced, `index.tsx` must move to `_marketing/index.tsx` to be wrapped by the marketing layout. Auth routes (`login.tsx`, `register.tsx`, etc.) should remain top-level (outside both layouts) and use their own `AuthPageLayout`.

3. **SSR hydration mismatch:** Scroll-dependent state (`isScrolled`, `showBackToTop`) is `false` on the server. Ensure these don't cause hydration mismatches by only applying scroll-dependent CSS classes client-side (e.g., via `useEffect` + state, not directly in the SSR render).

4. **Mobile nav close on navigation:** When a user taps a nav item in the mobile nav overlay, the overlay must close immediately. Use a `useEffect` that watches `router.state.location` and calls `closeMobileNav()`.

5. **Menu loading state:** When menu data is loading (`undefined`), the header should show a skeleton or placeholder nav, not an empty header. The site brand should always be visible.

6. **Orphaned menu items:** The `getMenuForLocation` query should filter orphaned items server-side. As a safety net, the client should also skip items where `isOrphaned === true`.

7. **Dropdown hover timeout:** Desktop dropdown menus should have a delay before opening (150ms) and closing (300ms) to prevent flickering when the mouse moves between items. Use `setTimeout` with cleanup on unmount/mouseleave.

8. **Widget area empty state:** If a footer widget area has no widgets, that column should be completely absent from the grid (not an empty column). Use conditional rendering based on widget count.

9. **Admin bar pushing layout:** The admin bar adds 32px to the top of the page. Any `sticky top-0` elements (like the header) need to account for this when the admin bar is present. Use `top-8` instead of `top-0` when admin bar is showing, or use CSS `calc()`.

10. **Back-to-top SSR:** The `BackToTop` component should not render during SSR (scroll position is unknown). Use a client-only wrapper or conditional rendering based on `mounted` state.

11. **Convex query undefined vs null:** Convex `useQuery` returns `undefined` while loading. Components must distinguish between "loading" (show skeleton) and "no data" (show fallback). Never treat `undefined` as "empty data".

12. **Multiple layout instances:** The `_marketing.tsx` and `_dashboard.tsx` layouts are separate route trees. Navigating between them (e.g., from a blog post to the dashboard) will unmount one layout and mount the other. This is expected behavior but means there's no shared state between layouts unless lifted to `__root.tsx`.

13. **SEO for layout structure:** The marketing layout should output clean semantic HTML for search engines. Use `<header>`, `<main>`, `<aside>`, `<footer>`, `<nav>` elements, not generic `<div>` wrappers.

14. **Breadcrumb JSON-LD:** The `Breadcrumbs` component should output JSON-LD structured data for the `BreadcrumbList` schema. This helps search engines understand the site hierarchy. Output as a `<script type="application/ld+json">` tag.

15. **Logo image optimization:** The site logo in `SiteBrand` should use responsive image attributes (`srcSet`, `sizes`) if the logo URL supports it. At minimum, specify `width` and `height` attributes to prevent layout shift.

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|----------------|
| **Menu System** | **Hard** | `api.menus.getMenuForLocation` query for header nav, footer nav, mobile nav, social links. Layout cannot render navigation without this. |
| **Settings System** | **Hard** | `api.settings.getPublic` for site title, tagline, logo URL, homepage display mode. Header renders site identity from this. |
| **Auth System** | **Medium** | Convex Auth `useAuth()` for displaying login/logout in header, user menu. Layout works without auth but user menu is absent. `getAuth()` for dashboard layout SSR redirect. |
| **User Profile System** | **Soft** | `api.users.getCurrentUser` for user avatar and display name in header user menu. Falls back to the auth system user data. |
| **Search System** | **Soft** | Search overlay navigates to `/search?q=...`. Search indexing and results are handled by Search System. Layout just provides the search input UI. |

### Depended On By

| System | Type | What They Need |
|--------|------|----------------|
| **Website Blog & Content UI Expert** | **Hard** | All blog and content pages render inside `_marketing.tsx` layout's `<Outlet />`. They depend on header, footer, sidebar, breadcrumbs being present. |
| **Website Auth Pages UI Expert** | **Hard** | Auth pages do NOT use these layouts (they use `AuthPageLayout`), but they link to/from the main site. The header's login/logout links coordinate with auth pages. |
| **Website User Dashboard UI Expert** | **Hard** | All dashboard pages render inside `_dashboard.tsx` layout's `<Outlet />`. They depend on the dashboard sidebar, header, and footer. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex Auth** | Auth state for user menu display, admin bar visibility, dashboard access gate |
| **@auth/authkit-tanstack-react-start** | TanStack Start integration for Convex Auth (SSR loaders + client hooks) |
| **@base-ui/react** | UI primitives (Button for BackToTop, Input for SearchOverlay). Most layout components use plain HTML + Tailwind. |
| **Convex** | Reactive queries for menus, settings, themes, widgets |
| **Lucide React** | Icons (Menu, X, Search, ChevronRight, ChevronDown, ArrowUp, social platform icons, dashboard nav icons) |
| **Sonner** | Toast notifications (not directly used by layout, but Toaster is in root) |
| **TanStack Router / Start** | Routing, `<Link>`, `useMatches()`, `useRouterState()`, layout routes, SSR loaders |

---

## Existing Code Reference

### Currently Implemented Files

| File | Status | Notes |
|------|--------|-------|
| `ConvexPress-Website/apps/web/src/routes/__root.tsx` | Needs modification | Currently renders `<Header />` globally. Must be updated to remove header and grid layout when layout routes are introduced. |
| `ConvexPress-Website/apps/web/src/components/header.tsx` | To be replaced | Basic header with Sign In / Sign Out. Auth state patterns should be preserved in new `HeaderActions` / `UserMenu`. |
| `ConvexPress-Website/apps/web/src/routes/index.tsx` | Needs relocation | Currently a top-level route. Must move to `_marketing/index.tsx` to be wrapped by marketing layout. |
| `ConvexPress-Website/apps/web/src/routes/login.tsx` | Keep as-is | Auth page, stays outside layout routes. Uses `AuthPageLayout` (from Website Auth Pages UI Expert). |
| `ConvexPress-Website/apps/web/src/routes/api/auth/callback.tsx` | Complete | Convex Auth callback handler. Do not modify. |

### UI Component Patterns (Match These)

All layout components should follow the patterns established in the existing UI components:

- **Button:** Uses `@base-ui/react/button` via `ButtonPrimitive`. Uses `cva` for variants. File: `src/components/ui/button.tsx`
- **DropdownMenu:** Uses `@base-ui/react/menu` via `MenuPrimitive`. File: `src/components/ui/dropdown-menu.tsx`
- **Card:** Uses standard `div` elements with `data-slot` attributes. File: `src/components/ui/card.tsx`
- **Input:** Uses `@base-ui/react/input` via `InputPrimitive`. File: `src/components/ui/input.tsx`
- **All colors via CSS variables** -- `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`, `text-destructive`, `bg-primary`, `text-primary-foreground`, etc.
- **No rounded corners** -- `rounded-none` is the default across all components
- **Text size** -- Default is `text-xs` for body, `text-sm` for headings within cards
- **Utility function:** `cn()` from `@/lib/utils` for class merging (uses `clsx` + `tailwind-merge`)
- **data-slot attributes** -- All components use `data-slot` for styling hooks

### Package Dependencies (Already Installed)

These packages are already available in `ConvexPress-Website/apps/web/package.json`:
- `@base-ui/react` -- UI primitives
- `@auth/authkit-tanstack-react-start` -- Auth integration
- `class-variance-authority` -- Component variants
- `clsx` + `tailwind-merge` -- Class utilities
- `lucide-react` -- Icons
- `sonner` -- Toast notifications
- `convex` -- Database client

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `header.php` | `SiteHeader` + `_marketing.tsx` layout | Site header rendering |
| `footer.php` | `SiteFooter` | Footer with widgets and nav |
| `sidebar.php` | `Sidebar` + `WidgetArea` | Widget area rendering |
| `wp_nav_menu()` | `DesktopNav` + `useMenuForLocation()` | Navigation menu output |
| `register_nav_menus()` | `menuLocations` Convex table | Theme location registration |
| `dynamic_sidebar()` | `<WidgetArea slug="..." />` | Widget area rendering |
| `get_template_part()` | Layout route components | Template part inclusion |
| `wp_head()` | TanStack Start `head()` + `ThemeStyleInjector` | Head content injection |
| `wp_footer()` | `SiteFooter` component | Footer rendering |
| `wp_body_open()` | `SkipToContent` component | Early body content |
| `body_class()` | Tailwind classes on layout wrapper | Contextual CSS classes |
| `the_custom_logo()` | `SiteBrand` component | Custom logo output |
| `bloginfo('name')` | `useSiteIdentity().title` | Site title |
| `bloginfo('description')` | `useSiteIdentity().tagline` | Site tagline |
| `is_admin_bar_showing()` | `useAdminBarVisibility().showAdminBar` | Admin bar visibility check |
| `wp_admin_bar_render()` | `WebsiteAdminBar` component | Front-end admin bar |
| `has_nav_menu()` | `useMenuForLocation() !== undefined` | Check if location has menu |
| `is_active_sidebar()` | `widgets.length > 0` check in `WidgetArea` | Check if sidebar has widgets |
