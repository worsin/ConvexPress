# Dashboard — the customer dashboard module system

The signed-in member area is assembled, not authored. Three sources drive it:

| Source | Owner | What it decides |
|---|---|---|
| **Settings › Dashboard** (`dashboardConfig` on `api.settings.queries.getPublic`) | admin | base path, layout, menu locations, sidebar width/collapse, search/bell/theme toggles, brand mark, landing page, footer, member editing, welcome headline |
| **Menus** (`api.menus.queries.getMenuForLocation`) | admin | sidebar, top bar, and profile dropdown items — including headings, separators, icons, badges, visibility rules, and per-item path overrides |
| **Registry** (`api.extensions.dashboard.queries.registry`) | backend code | the catalog of page ids and widget ids, their titles/icons/groups, plugin + capability gates, widget sizes and settings, grid geometry, badge sources |

The website adds the fourth piece: **modules** that render one page or one
widget per registry id.

```
apps/web/src/dashboard/
├── contracts.ts            DashboardPageModule / DashboardWidgetModule (the contract)
├── registry.ts             import.meta.glob scanner → getPageModule(id) / getWidgetModule(id)
├── registry-core.ts        pure scanner (tested)
├── types.ts                registry payload types (mirror of the backend registry)
├── nav.ts                  menu tree → NavItem[], registry → generated sidebar, page resolution (tested)
├── grid.ts                 12-column geometry: collisions, compaction, snapping (tested)
├── icons.ts                lucide kebab-name resolver with fallback
├── DashboardShell.tsx      the frame (auth guard, config, menus, badges, sidebar/topbar/both)
├── AccountLayout.tsx       compact frame when the Dashboard plugin is disabled
├── DashboardPage.tsx       renders one page module by id (+ "unavailable" card)
├── DashboardPathHost.tsx   renders the dashboard for a configurable base path
├── WidgetGrid.tsx          the home: live layout, customize mode, picker, settings, reset
├── shell/                  SidebarNav, Topbar, ProfileMenu, MobileDrawer, BrandMark, NavItemLink, ShellFooter, hooks
├── grid/                   WidgetCard chrome, WidgetPicker, WidgetSettingsDialog, useLayoutEditor
├── pages/<id>/manifest.tsx        official page modules
├── widgets/<id>/manifest.tsx      official widget modules
├── pages.local/<id>/manifest.tsx  site-specific page modules (gitignored via *.local)
└── widgets.local/<id>/manifest.tsx site-specific widget modules (gitignored via *.local)
```

## Module contract

`apps/web/src/dashboard/contracts.ts` is the source of truth. In short:

```ts
// pages/<id>/manifest.tsx
const module: DashboardPageModule = {
  id: "orders",                       // == folder name == backend registry id
  matchSubpath: (subpath) => …,       // optional; "/ORD-1" or "/ORD-1/return"
  Page: ({ subpath }) => <…/>,        // body only; the shell provides chrome
};
export default module;

// widgets/<id>/manifest.tsx
const module: DashboardWidgetModule = {
  id: "orders",
  Widget: ({ size, settings, editing, instanceKey }) => <…/>,  // body only
  Actions: (props) => <ViewAllLink … />,                        // optional title-row slot
  title: "Recent orders" | (props) => ReactNode,                // optional override
};
```

Rules (repeated from the contract):

- The folder name **is** the id and must exist in the backend registry
  (`ConvexPress-Admin/packages/backend/convex/extensions/dashboard/registry.ts`
  or an extension's `dashboard.ts`). Unknown ids are dropped by the backend
  when a layout is saved.
- Never hardcode the base path — `useDashboardPath().to("/orders/123")`.
- Gates are enforced by the shell from registry data; modules may assume they
  are allowed to render.
- Widgets render at any allowed size; read `size` and degrade (fewer rows).
  Empty, loading, and error states live inside the body — use
  `WidgetSkeleton` and `WidgetEmpty` from `grid/WidgetCard.tsx`.
- Brand tokens only; Base UI only.
- A registry id with no module renders an "unavailable" card so streams can
  land independently (the grid and the nav both tolerate this).

## Adding a module

1. Add the id to the backend registry (page or widget definition) and deploy.
2. Create `apps/web/src/dashboard/pages/<id>/manifest.tsx` (or `widgets/<id>/`).
   Put the body in a sibling file; keep the manifest tiny.
3. If the page needs a legacy `/dashboard/<path>` URL, add a thin wrapper in
   `apps/web/src/routes/dashboard/` that renders `<DashboardPage id="…" subpath="…" />`.
   The configurable base path host needs nothing: it resolves pages from the
   registry (`resolvePageFromRemainder` in `nav.ts`).
4. Run `bun run check-types` and `bun test src/dashboard`.

Site-specific overrides go in `pages.local/` and `widgets.local/`; a local
module with the same id replaces the official one (see `registry-core.ts`).

## Navigation resolution

```
sidebar  = menu(sidebarLocation)  ?? registryToNav(pages, { withHeadings, can, implementedPageIds })
topbar   = menu(topbarLocation)   ?? (layout === "topbar" ? flat registry nav : [])
profile  = menu(profileLocation)  ?? [Profile, Settings] + Sign out
```

Menu items are already visibility-filtered and URL-resolved by the backend
(`itemType: dashboard | heading | separator | custom | page | …`, `icon`,
`badge`, `pathOverride`). Badges come from one subscription,
`api.extensions.dashboard.queries.myBadges`, keyed by the item's `badge`.

## Configurable base path

`dashboardConfig.basePath` defaults to `/dashboard`, where the file routes
under `routes/dashboard/` live. For any other value:

- `routes/dashboard.tsx` redirects `/dashboard/*` to the configured path,
  preserving the remainder and query string (`legacyDashboardRedirect`).
- `routes/$.tsx` (top-level splat, lowest rank) checks the public settings in
  its loader; when the path is under the base path it renders
  `DashboardPathHost`, otherwise it throws `notFound()`.
- A single-segment base path root (`/account`) is claimed by
  `routes/_marketing/$slug.tsx` (dynamic beats splat), which hands off to the
  same host and hides the marketing header/footer via page overrides.

## The home grid

`WidgetGrid.tsx` reads `api.extensions.dashboard.queries.myLayout` (the
member's arrangement over the inherited plan/role/default scope) and the
registry. Geometry is the server's `DASHBOARD_GRID` (12 columns, 96 px rows,
16 px gap, named sizes sm/md/lg/xl). Customize mode (when `canEdit`): drag
handle to move, resize handle or the size button to snap to the widget's
allowed sizes, hide/show, add from the picker, per-widget settings from the
registry schema, reset to default, and a notice when the inherited layout
changed. Writes go through `saveMyLayout` (debounced 600 ms) and reflect via
the subscription; the backend re-normalizes every layout. Keyboard: arrows
move, shift+arrows cycle size, delete hides. Below `md` the widgets stack in
reading order.

## Disabled plugin

When `plugins.dashboardEnabled === false`, `DashboardShell` renders
`AccountLayout`: the site header/footer around a tabbed account page
(profile, settings, security, notifications) hosting the same modules. Every
other dashboard URL still renders beneath the tabs.

## Skill

`design-dashboard` (`.claude/skills/design-dashboard/SKILL.md`) restyles the
shell, widget card chrome, and account fallback within this contract. Page
content belongs to `website-member-dashboard` and the domain skills.
