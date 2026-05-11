# Data API — admin-side helpers an extension uses

The verified admin-side APIs an extension commonly calls. Everything
listed has been confirmed to exist in the admin backend.

If a name isn't on this list, it doesn't exist. Don't guess.

---

## Helpers (server-side, used by extension queries/mutations)

These live in `packages/backend/convex/helpers/` and are imported into
your extension's `queries.ts` / `mutations.ts`.

### Auth

```ts
import { getCurrentUser, requireAuth, requireAdmin } from "../helpers/auth";

// In a query:
const user = await getCurrentUser(ctx);          // user or null
const user = await requireAuth(ctx);             // throws if not signed in
const user = await requireAdmin(ctx);            // throws if not admin
```

### Permissions

```ts
import { requireCan, currentUserCan } from "../helpers/permissions";

// In a mutation:
const user = await requireCan(ctx, "event.create");   // throws if missing cap

// In a query / route guard:
const canDo = await currentUserCan(ctx, "event.update");
```

### Events (audit log + downstream listeners)

```ts
import { emitEvent } from "../helpers/events";

await emitEvent(ctx, EVENT_CODE, SYSTEM_CODE, payload);
```

`EVENT_CODE` and `SYSTEM_CODE` come from `convex/events/constants.ts`.
If your extension needs new event codes, add them there following
existing naming (`POST_EVENTS.CREATED`, etc.) — those constants are
shared and not extension-private.

### Plugin gating (server-side)

```ts
import { requirePluginEnabled } from "../helpers/plugins";

// In a mutation/query handler that should fail closed when extension
// is disabled:
await requirePluginEnabled(ctx, "events");
```

---

## Settings system (server-side, for extension-specific settings)

Extensions often have their own settings page. Use the settings system
rather than rolling your own.

```ts
// Read a settings section
import { api } from "../_generated/api";
const settings = await ctx.runQuery(api.settings.queries.getBySection, {
  section: "events",
});

// Write a settings section (typically from a mutation invoked by the
// settings page form)
await ctx.runMutation(api.settings.mutations.updateSection, {
  section: "events",
  values: { ... },
});
```

The `<extension>` section name should match the extension's id.

---

## Client-side helpers an extension's admin UI uses

These live in `apps/web/src/hooks/` and `apps/web/src/lib/`.

### Capability checks (route guards, conditional UI)

```ts
import { useCan } from "@/hooks/useCan";
const canCreate = useCan("event.create");
```

### Plugin gating (route render)

```tsx
import { PluginGuard } from "@/components/plugins/PluginGuard";

// Wraps content; renders fallback when plugin is disabled
<PluginGuard pluginId="events">
  <EventsList />
</PluginGuard>
```

### Plugin settings hook

```ts
import { usePluginSettings } from "@/hooks/usePluginSettings";
const { plugins, values } = usePluginSettings();
const isEnabled = values.eventsEnabled;
```

### Convex queries / mutations from React

Same patterns as the rest of the admin app:

```ts
import { useQuery } from "convex-helpers/react/cache";   // cached
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";

const events = useQuery(api.events.queries.list, { ... });
const createEvent = useMutation(api.events.mutations.create);
```

---

## Things you import / modify (NOT a query / mutation)

### Plugin registry

```ts
// apps/web/src/lib/plugins/registry.ts
// MODIFY this file to add your extension:
//   - AdminPluginId union: add "yourId"
//   - PluginSettingsValues: add yourIdEnabled: boolean
//   - ADMIN_PLUGINS array: push new entry
//   - DEFAULT_PLUGIN_SETTINGS: yourIdEnabled: false (or true)
//   - PLUGIN_PARENT: optional dependency map
```

### Admin nav

```ts
// apps/web/src/lib/admin-shell/nav-config.ts
// MODIFY this file to add a new section to ADMIN_NAV_SECTIONS
// with pluginId set to your extension's id
```

### Schema hub

```ts
// packages/backend/convex/schema.ts
// MODIFY to import + spread your extension's tables export
```

---

## Capability registry (read-only for extensions)

Capabilities are managed by `/experts:role-capability-system`. The
extension defines what capabilities it needs and uses them via
`requireCan`, but does NOT add them to the central registry itself.

If you need new caps, list them in the generation report. The Role
expert handles the registry side.

The capability naming convention: `<resource>.<action>`. Examples:

- `event.create`, `event.update`, `event.delete`, `event.publish`
- `event.view_unpublished`
- `event.manage_settings`

---

## What is NOT available

| Tempting | Reality |
|---|---|
| `api.extensions.register()` | No runtime registration; everything is compile-time via `registry.ts`. |
| `api.plugins.install()` | No install flow. Extensions are platform code. |
| `defineExtension(...)` helper | Doesn't exist. Use the manual `ADMIN_PLUGINS.push(...)` pattern. |
| A way to add capabilities at runtime | Capabilities are registry-driven. The Role expert manages them. |

---

## CLI for inspection

```bash
# From admin backend folder:
cd ConvexPress-Admin/packages/backend

# Inspect existing plugin settings
bunx convex run settings:queries:getBySection '{"section":"pluginSettings"}'

# Test your extension's queries
bunx convex run <ext>:queries:list '{"paginationOpts":{"numItems":3,"cursor":null}}'
```

---

## When in doubt

1. Read the actual admin backend folder for a similar existing
   extension (e.g., `recipes`, `gallery`) to see real patterns.
2. If a helper you need doesn't exist, that's a real gap — surface
   it in the report, don't fake the call.
