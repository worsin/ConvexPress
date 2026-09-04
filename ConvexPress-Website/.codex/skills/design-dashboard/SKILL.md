---
name: design-dashboard
description: Use when the user asks to design, redesign, build, regenerate, or restyle the customer dashboard shell — the signed-in member area (sidebar, top bar, profile menu, widget home, account pages). Triggers on "design the dashboard", "redo the member area", "restyle the account pages", "fix the dashboard sidebar", "change the widget cards". Styles the settings-driven shell at apps/web/src/dashboard/DashboardShell.tsx (plus widget card chrome and the compact account fallback) without bypassing admin-selected menus, registry gates, or dashboard settings.
---

# design-dashboard

You are styling the **customer dashboard** — the signed-in member area. The
dashboard is a settings- and registry-driven system, not a hand-built page:
menus supply the navigation, the backend registry supplies pages and widgets,
`dashboardConfig` shapes the shell, and page/widget *modules* only render.
Output stays in the shell, card chrome, and account fallback files; the visible
structure must keep coming from admin data.

## Reading order

1. `design-kit/README.md`, `ARCHITECTURE.md`, `CONTRACTS.md`, `BRAND.md`.
2. `design-kit/DASHBOARD.md` — the module system, data sources, and gates.
3. `design-kit/references/dashboard.tsx` — the reference shell shape.
4. `apps/web/src/dashboard/contracts.ts` — the page/widget module contract.
5. The backend registry (ids, sizes, grid, badge sources):
   `../ConvexPress-Admin/packages/backend/convex/extensions/dashboard/registry.ts`
   and the settings shape `DashboardSettings` in
   `../ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`.
6. The current files you are about to restyle (below).

## Hard contract

- **Navigation comes only from menu locations, then the registry fallback.**
  Sidebar = `dashboardConfig.sidebarLocation`, top bar = `topbarLocation`,
  profile dropdown = `profileLocation`. When a location has no menu, the
  sidebar is generated from `api.extensions.dashboard.queries.registry`
  (grouped by registry group, plugin-filtered by the backend, capability-
  filtered on the client, limited to pages that have a website module). Never
  inline a list of dashboard routes.
- **Never hardcode the base path.** Build every href with `useDashboardPath()`
  (`apps/web/src/hooks/useDashboardConfig.ts`); menu item URLs already carry
  the base path and any per-item path override — use them verbatim.
- **Respect gates.** Plugin gates are applied by the backend registry and menu
  query; capability gates (`page.capability`, `widget.capability`) by the
  shell (`useCanFn`). Modules assume they are allowed to render.
- **Honor every `DashboardSettings` field**: `basePath`, `layout`
  (sidebar | topbar | both), the three menu locations, `sidebarWidth`,
  `sidebarCollapsedByDefault` (member preference persists), `showSearch`,
  `showNotificationBell`, `showThemeToggle`, `brandMark` + `customLogoUrl`,
  `landingPage`, `footerVariant`, `membersCanEditHome` (combined with the
  layout's `canEdit`), `welcomeHeadline` (`{name}` substitution).
- **Brand tokens only.** `bg-sidebar`, `text-sidebar-foreground`,
  `bg-card`, `text-primary`, … from `apps/web/src/index.css`. No literal
  colors, no `@radix-ui/*`, Base UI for interactive primitives.
- **Disabled plugin = compact account frame.** When
  `plugins.dashboardEnabled === false` the same page modules render inside
  `AccountLayout` (site header + tabbed account page). Both frames must keep
  every existing URL working.
- **Tolerate missing modules.** A registry page or widget without a website
  module renders the "unavailable" card, never a crash (notifications and
  tickets modules are owned by another stream).
- **Keep subscriptions few.** The shell shares registry, badges, and menus
  through `DashboardShellContext`; do not add per-widget copies of those
  queries. Backends cap concurrent queries per client.

## Workflow

1. Read the kit files above and pull the live config and menus:
   ```bash
   cd ../ConvexPress-Admin/packages/backend
   bunx convex run settings/queries:getPublic '{}'        # dashboardConfig, plugins
   bunx convex run extensions/dashboard/queries:registry '{}'
   bunx convex run menus/queries:getMenuForLocation '{"locationSlug":"dashboard-sidebar"}'
   ```
2. Inspect the files you will touch:
   - `apps/web/src/dashboard/DashboardShell.tsx` (frame, auth guard, data plumbing)
   - `apps/web/src/dashboard/shell/*` (SidebarNav, Topbar, ProfileMenu, MobileDrawer, BrandMark, NavItemLink, ShellFooter)
   - `apps/web/src/dashboard/grid/WidgetCard.tsx` (widget card chrome)
   - `apps/web/src/dashboard/WidgetGrid.tsx` (home grid + customize mode)
   - `apps/web/src/dashboard/AccountLayout.tsx` (compact fallback)
3. Restyle within those files. Keep the data hooks
   (`useDashboardConfig`, `useDashboardPath`, `useDashboardMenu`,
   `useRegistryNav`, `useDashboardBadges`) and the `DashboardShellContext`
   value shape intact.
4. Verify it compiles, run the pure tests, and browser-smoke desktop + mobile,
   light + dark, signed-out (redirect) and signed-in (shell, customize mode).
   ```bash
   bun run check-types
   bun test src/dashboard src/lib/dashboard
   ```

## Output contract

- **Files:** `apps/web/src/dashboard/DashboardShell.tsx`,
  `apps/web/src/dashboard/shell/*.tsx`, `apps/web/src/dashboard/grid/WidgetCard.tsx`,
  `apps/web/src/dashboard/AccountLayout.tsx`.
- **Must preserve:** the module contract (`contracts.ts`), registry ids, the
  route wrappers under `apps/web/src/routes/dashboard/`, the configurable
  base path host (`routes/$.tsx`, `routes/_marketing/$slug.tsx`), and the
  `DashboardShellContext` shape.
- **Must include when enabled by config/data:** brand mark, sidebar or top
  bar navigation with icons and live badges, collapsed sidebar mode, profile
  dropdown with sign out, search toggle, notification bell, theme toggle,
  footer variant, mobile drawer, widget card chrome with skeleton/empty
  states, customize toolbar (add, reset, done) when the member may edit.
- **Must not include:** hardcoded routes or site-specific nav lists, literal
  colors, Radix imports, or a parallel dashboard for one site.

## Verification checklist

- [ ] `bun run check-types` clean; `bun test` green.
- [ ] Signed-out `/dashboard/*` redirects to `/login?returnTo=…`.
- [ ] Sidebar shows the assigned menu, or the generated registry groups when none is assigned; headings and separators render as such.
- [ ] Badges appear next to items that declare a badge source and disappear at zero.
- [ ] Collapsed sidebar persists across reloads; mobile drawer opens/closes and closes on navigation.
- [ ] `layout: topbar` hides the sidebar and shows the links in the top bar; `both` shows both.
- [ ] `brandMark` site / custom / none all render; `footerVariant` none / minimal / full all render.
- [ ] Home grid: drag, resize snaps to allowed sizes, hide/show, add from picker, settings dialog, reset; layout persists after reload; `baseChanged` notice shows when applicable.
- [ ] Keyboard: arrows move, shift+arrows resize, delete hides, focus ring visible.
- [ ] Mobile (390px): widgets stacked in y-order, no horizontal scroll.
- [ ] `plugins.dashboardEnabled=false`: account tabs frame renders the same modules.
- [ ] A custom `basePath` renders at its path and `/dashboard/*` redirects there.
- [ ] Light and dark themes; no literal colors.

## When NOT to use this skill

- Site header / footer → `design:header`, `design:footer`.
- A single dashboard page's content (orders, profile forms) →
  `website-member-dashboard` / `website-commerce-experience`.
- Adding a brand-new page or widget id → the backend registry first
  (`extension-build` in the Admin repo), then a module folder here
  (`design-kit/DASHBOARD.md`).
