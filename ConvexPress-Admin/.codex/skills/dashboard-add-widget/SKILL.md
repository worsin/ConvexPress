---
name: dashboard-add-widget
description: Use when the user asks to add, register, or expose a new widget/card on the customer dashboard home grid — e.g. "add a loyalty balance widget", "my extension needs a dashboard card", "show recent invoices on the member home". Covers the registry entry (core or extension dashboard.ts) with sizes and settings, the website widget module, default layout placement, codegen, and typecheck.
---

# dashboard-add-widget

A home widget is one id shared by the backend registry (title, icon,
plugin gate, capability, allowed sizes, settings schema) and the website
widget module (rendering). Saved layouts reference widgets by id and by
the size presets in `DASHBOARD_GRID`. Admin needs nothing extra — the
layout editor's picker, size snapping, and settings drawer are driven by
the registry.

## Step 1 — Registry entry

- **Core / platform plugin**: append to `CORE_DASHBOARD_WIDGETS` in
  `ConvexPress-Admin/packages/backend/convex/extensions/dashboard/registry.ts`.
- **v2 extension**: create or extend
  `ConvexPress-Admin/packages/backend/convex/extensions[.local]/<id>/dashboard.ts`
  and export `widgets`:

```ts
import type { DashboardWidgetDefinition } from "../dashboard/registry";

export const widgets: DashboardWidgetDefinition[] = [
  {
    id: "loyalty-balance",         // stable, unique, = website folder name
    title: "Loyalty balance",
    description: "Points, tier, and the next reward.",
    icon: "gift",                  // lucide kebab-case
    pluginId: "loyalty",           // <pluginId>Enabled must be true
    sizes: ["sm", "md", "lg"],     // only sizes it renders well at
    defaultSize: "md",             // must be in sizes
    defaultInHome: true,           // placed by buildDefaultLayoutItems
    category: "commerce",          // overview|activity|commerce|learning|support|content
    // capability: "view_loyalty",
    settings: [
      { key: "showHistory", label: "Show recent history", kind: "toggle", defaultValue: true },
      { key: "limit", label: "History rows", kind: "number", defaultValue: 5, min: 1, max: 20 },
    ],
  },
];
```

Size presets (`DASHBOARD_GRID.sizes`): sm 3×2, md 4×3, lg 6×3, xl 12×4
on a 12-column grid, 96px rows. The editor snaps resizes to `sizes`;
`normalizeLayoutItems` clamps settings to the schema on save.

## Step 2 — Codegen + backend typecheck

```bash
cd ConvexPress-Admin/packages/backend
bun run codegen:extensions
./node_modules/.bin/tsc -p convex/tsconfig.json --noEmit
```

## Step 3 — Admin: nothing else

```bash
cd ConvexPress-Admin/apps/web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

The widget now shows in Customer dashboard → Home layouts → any layout →
"Add widget" (grouped by category, with a disabled-plugin note when the
plugin is off), and its `settings` render in the inspector.

## Step 4 — Website widget module

Create `ConvexPress-Website/apps/web/src/dashboard/widgets/<id>/manifest.tsx`
following `ConvexPress-Website/apps/web/src/dashboard/contracts.ts`:

```tsx
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";

function LoyaltyBalanceWidget({ size, settings, editing }: DashboardWidgetProps) {
  const limit = Number(settings.limit ?? 5);
  // Degrade by size: "sm" = figure only, "md" = + tier, "lg" = + history.
  // Render loading / empty / error states inside the card; no outer chrome.
  return <div>…</div>;
}

const manifest: DashboardWidgetModule = {
  id: "loyalty-balance",
  Widget: LoyaltyBalanceWidget,
  // Actions: ({ size }) => <Link to={useDashboardPath("/loyalty")}>View all</Link>,
};

export default manifest;
```

```bash
cd ConvexPress-Website/apps/web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

## Step 5 — Layouts

`defaultInHome: true` adds the widget to the platform default for sites
that have not saved a layout. Sites with saved layouts add it from the
picker; nothing migrates automatically (by design — admins own their
grids).

## Report

- Registry location, id, sizes/defaultSize, settings keys, pluginId
- Codegen output line for dashboard contributions
- Website module path, done or pending
- Both typechecks passing
