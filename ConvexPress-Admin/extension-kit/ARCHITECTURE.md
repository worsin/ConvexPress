# Extension Architecture — the 7 layers

Every extension in ConvexPress touches the same 7 layers. Building an
extension means producing the right artifact at each layer in the right
order. Skipping a layer = the extension half-works (typical failure
mode: extension's admin UI loads but nav doesn't hide it when disabled,
or mutations don't check capabilities, etc.).

This doc explains each layer. `CONTRACTS.md` turns each into a
validation rule. `WORKFLOW.md` orders them for execution.

---

## Layer 1 — Backend schema

**File:** `packages/backend/convex/schema/<extension>.ts`

The extension's data lives in dedicated tables. Each table is defined
with `defineTable(...)` plus typed validators (`v.string`, `v.id`, etc.)
and indexes for the queries that will read it.

### Rules

- Schema file exports a single named object, e.g. `eventsTables`, that
  groups every table belonging to the extension.
- The main `convex/schema.ts` imports + spreads it. Each system owns
  ONLY its own file; never edit other systems' schemas.
- Tables are named globally — no two systems can use the same table
  name. Prefer prefixed names if collision risk exists
  (`commerceBundles` not `bundles`).
- Indexes follow `by_<column>` naming.
- Cross-system references use `v.id("<otherTable>")`.

### Example pattern

```ts
// schema/events.ts
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const eventsTables = {
  events: defineTable({
    title: v.string(),
    slug: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    venue: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status_startsAt", ["status", "startsAt"]),
};
```

Then in `schema.ts`:
```ts
import { eventsTables } from "./schema/events";
export default defineSchema({
  ...otherTables,
  ...eventsTables,
});
```

---

## Layer 2 — Convex queries

**File:** `packages/backend/convex/<extension>/queries.ts`

Reads from the extension's tables. Two flavors: admin-side queries
(authenticated, can return everything) and public-safe queries (used
by the Website, must omit secrets and respect content gating).

### Rules

- Always import `query` (not `internalQuery`) for client-callable reads.
- Public-safe reads should explicitly filter and project — never `.collect()`
  raw documents and return them.
- Naming conventions match the rest of the codebase:
  - `list` — paginated, admin-facing
  - `listPublished` — paginated, public-safe (status=published, etc.)
  - `get` — single by id (admin)
  - `getBySlug` — single by slug (public-safe)
  - `counts` — aggregate counts for the admin dashboard
- Use pagination via `paginationOpts` for any list that can grow large.

### Example pattern

See `references/queries.example.ts`.

---

## Layer 3 — Convex mutations

**File:** `packages/backend/convex/<extension>/mutations.ts`

Writes to the extension's tables.

### Rules

- Every mutation calls `requireCan(ctx, "<capability>")` or a similar
  helper from `convex/helpers/permissions.ts` at the top of the handler.
  No mutation is unauthenticated.
- Emit events via `emitEvent(ctx, ...)` for anything other systems
  should react to (audit log, notifications, downstream sync).
- Validate inputs with `v.*` validators — even fields you're sure about.
  The Convex validator is the contract.

### Example pattern

See `references/mutations.example.ts`.

---

## Layer 4 — Admin UI routes

**Folder:** `apps/web/src/routes/_authenticated/_admin/<extension>/`

The extension's admin pages: list, edit, settings, etc. Use TanStack
Router's `createFileRoute` pattern.

### Rules

- Routes live under `_authenticated/_admin/` so they inherit auth and
  admin-only gating.
- For routes that should fail closed when the extension is disabled,
  wrap with `<PluginGuard pluginId="<id>">...</PluginGuard>` or call the
  `requirePluginEnabled` route helper. **This is non-negotiable** for
  extensions that can be toggled off.
- Use Base UI for interactive components — never `@radix-ui/*`.
- Full-page navigation only — no modal/dialog for content management.
  Confirmation dialogs (delete, etc.) are the only allowed popup.
- Reuse list-table, settings, and editor primitives where possible.

### Example pattern

See `references/admin-list-route.example.tsx`.

---

## Layer 5 — Plugin registry entry

**File:** `apps/web/src/lib/plugins/registry.ts` (MODIFY in place)

The single source of truth that says "this extension exists." Without
this entry, the `/plugins` page can't toggle it on/off and gating
helpers don't know about it.

### What you add

1. The extension's id to the `AdminPluginId` union type
2. The `<id>Enabled` boolean to `PluginSettingsValues`
3. A new `AdminPluginDefinition` entry in `ADMIN_PLUGINS`:
   ```ts
   {
     id: "events",
     title: "Events",
     description: "Time-based event content with start/end and venue.",
     icon: Calendar,
     settingsKey: "eventsEnabled",
     navSectionIds: ["events"],            // matches nav section id
     adminAccessPrefixes: ["/events"],     // admin URL prefixes gated
     routePrefixes: ["/events"],           // public URL prefixes gated
   }
   ```
4. The default-enabled state in `DEFAULT_PLUGIN_SETTINGS`
5. Optional parent dependency in `PLUGIN_PARENT` (e.g.,
   `commerceReviews` depends on `commerce`)

See `references/registry-entry.example.ts` for the full pattern.

### Rules

- The `id` is camelCase and matches the convex folder name.
- `settingsKey` is `<id>Enabled` (boolean).
- `navSectionIds` MUST match the `id` of the nav section in
  `nav-config.ts` (Layer 6).
- `adminAccessPrefixes` are the URL paths the gating helper checks —
  set this to whatever URLs the admin routes (Layer 4) live at.
- `routePrefixes` are Website-side URL prefixes — set only if the
  extension exposes a public surface.

---

## Layer 6 — Admin nav entry

**File:** `apps/web/src/lib/admin-shell/nav-config.ts` (MODIFY in place)

Adds the extension to the admin sidebar. The nav helper auto-hides
sections whose `pluginId` is disabled.

### What you add

A new entry to `ADMIN_NAV_SECTIONS` with:
- `id` matching the registry's `navSectionIds[0]`
- `pluginId` set to the extension's id (this triggers auto-hide)
- `capability` set to the highest-required capability for any child
- `children` covering the typical list / Add New / settings sub-routes

### Rules

- `pluginId` is mandatory if the section belongs to an extension. Without
  it, the section will appear even when the extension is disabled.
- Children point to the routes you created in Layer 4.
- Use the appropriate Lucide icon from `lucide-react`.

---

## Layer 7 — Capabilities

**Files:** Various; coordinated by `/experts:role-capability-system`.

Each mutation, query, and route that the extension creates needs a
capability. The Role & Capability System manages the central registry;
your extension's job is to **define + use** capabilities, not to
register them in the system itself.

### What an extension typically needs

- One capability per major action: `event.create`, `event.update`,
  `event.delete`, `event.publish`, `event.view_unpublished`, etc.
- Capability used at the top of every mutation handler:
  ```ts
  const user = await requireCan(ctx, "event.create");
  ```
- Capability checked at the route level via the route's `beforeLoad`
  or by `<RoutePermissionGuard capability="...">`.

### Rules

- New capabilities are added to the role registry by the role expert,
  not by the extension's own code. Your generation report SHOULD list
  the new capabilities the role expert needs to add.
- All five built-in roles (administrator, editor, author, contributor,
  subscriber) should be considered when granting the new capability —
  default to administrator-only and surface in the report which roles
  the user wants to grant access to.

---

## How these 7 layers interact at runtime

1. User visits `/events`.
2. Route guard checks `isPluginEnabled("events", settings)`. If
   disabled, route 404s (or shows "Extension disabled" component).
3. Component renders, calls `useQuery(api.events.queries.list, …)`.
4. Convex query handler runs in the backend, also gated by
   `requirePluginEnabled` if implemented at the query level.
5. User submits a form — mutation fires. Mutation checks
   `requireCan(ctx, "event.create")` before writing.
6. Sidebar shows or hides the "Events" section based on plugin
   settings, evaluated by `isPluginNavSectionEnabled`.
7. If the extension has a Website surface, the Website's marketing
   layout may also call helpers to gate `routePrefixes`.

The result: turning the toggle off at `/plugins` removes the
extension's presence everywhere. Turning it on restores everything.
That guarantee is what makes the 7-layer contract worth following.
