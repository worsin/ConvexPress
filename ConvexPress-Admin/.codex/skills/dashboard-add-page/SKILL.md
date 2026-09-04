---
name: dashboard-add-page
description: Use when the user asks to add, register, or expose a new page/screen in the customer dashboard (website member area) — e.g. "add a Loyalty page to the dashboard", "my extension needs a dashboard page", "make X show up in the member sidebar". Covers the registry entry (core or extension dashboard.ts), the website page module, menu wiring, codegen, and typecheck.
---

# dashboard-add-page

A customer-dashboard page is one id shared by three places: the backend
registry (title, icon, path, plugin gate, capability, group, badge), the
website page module (rendering), and menus (navigation by id). Admin
needs nothing extra — the menu builder, settings landing-page picker,
and structure preview read the merged registry automatically.

## Step 1 — Registry entry

Decide where the page belongs:

- **Core / platform plugin** (commerce, tickets, lms, …): append to
  `CORE_DASHBOARD_PAGES` in
  `ConvexPress-Admin/packages/backend/convex/extensions/dashboard/registry.ts`.
- **v2 extension**: create or extend
  `ConvexPress-Admin/packages/backend/convex/extensions[.local]/<id>/dashboard.ts`
  and export `pages`:

```ts
import type { DashboardPageDefinition } from "../dashboard/registry";

export const pages: DashboardPageDefinition[] = [
  {
    id: "loyalty",                 // stable, unique, = website folder name
    title: "Loyalty points",
    icon: "gift",                  // lucide kebab-case
    description: "Balance, history, and rewards.",
    path: "/loyalty",              // under the dashboard base path
    pluginId: "loyalty",           // <pluginId>Enabled must be true
    group: "commerce",             // overview|activity|commerce|learning|support|account
    defaultInSidebar: true,
    // capability: "view_loyalty", // optional website capability
    // badge: "notifications.unread", // optional, one of BADGE_SOURCES
  },
];
```

Rules: `id` unique across all pages (grep `registry.ts` and every
`dashboard.ts`); `path` unique; no Convex imports in `dashboard.ts`.

## Step 2 — Codegen + backend typecheck

```bash
cd ConvexPress-Admin/packages/backend
bun run codegen:extensions        # writes convex/schema/_dashboardIndex.generated.ts
./node_modules/.bin/tsc -p convex/tsconfig.json --noEmit
```

## Step 3 — Admin: nothing else

Confirm in the admin (typecheck only — no code):

```bash
cd ConvexPress-Admin/apps/web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

The page now appears in Menus → Add items → "Dashboard pages", in the
Customer dashboard → Settings landing-page select, and in the generated
sidebar preview when its plugin is enabled.

## Step 4 — Website page module

Create `ConvexPress-Website/apps/web/src/dashboard/pages/<id>/manifest.tsx`
following `ConvexPress-Website/apps/web/src/dashboard/contracts.ts`:

```tsx
import type { DashboardPageModule } from "../../contracts";

function LoyaltyPage({ subpath }: { subpath: string }) {
  // Use useDashboardPath() for links; never hardcode the base path.
  // Render loading / empty / error states; brand tokens only.
  return <section>…</section>;
}

const manifest: DashboardPageModule = {
  id: "loyalty",
  Page: LoyaltyPage,
  // matchSubpath: (subpath) => subpath.startsWith("/"), // for nested detail pages
};

export default manifest;
```

Then typecheck the website:

```bash
cd ConvexPress-Website/apps/web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

## Step 5 — Navigation (optional)

If a site uses a custom dashboard sidebar menu, add the page there
(Menus → the menu assigned to `dashboard-sidebar` → Dashboard pages).
Unassigned locations pick the page up automatically when
`defaultInSidebar` is true.

## Report

- Registry location (core vs `<ext>/dashboard.ts`), id, path, pluginId
- Codegen output line for dashboard contributions
- Website module path, and whether it is done or pending
- Both typechecks passing
