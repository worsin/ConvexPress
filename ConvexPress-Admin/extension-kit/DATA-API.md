# Data API — admin-side helpers an extension uses (v2)

The verified admin-side APIs an extension commonly calls. Everything
listed has been confirmed to exist in the admin backend.

If a name isn't on this list, it doesn't exist. Don't guess.

---

## Where extension code lives, and how its API path is shaped

For an extension with id `<id>`, the Convex API exposes:

```
api.extensions.<id>.queries.*      from packages/backend/convex/extensions[.local]/<id>/queries.ts
api.extensions.<id>.mutations.*    from packages/backend/convex/extensions[.local]/<id>/mutations.ts
api.extensions.<id>.internals.*    from packages/backend/convex/extensions[.local]/<id>/internals.ts (if exists)
```

Convex auto-generates these paths from the file location — no
registration step is needed. The `extensions` segment in the API path
corresponds to the folder name; the `<id>` segment corresponds to the
extension's folder. **Note:** `extensions` and `extensions.local`
produce slightly different paths since Convex normalizes the folder
name. Verify against `_generated/api.d.ts` after first deploy.

---

## Helpers (server-side, used by extension queries/mutations)

These live in `packages/backend/convex/helpers/` and are imported into
your extension's `queries.ts` / `mutations.ts`.

### Auth

```ts
import { getCurrentUser, requireAuth, requireAdmin } from "../../helpers/auth";

// Note the double `../` — extensions live at convex/extensions[.local]/<id>/,
// so helpers are two levels up. (Three levels up if you have a nested
// folder like convex/extensions/<id>/sub/.)

const user = await getCurrentUser(ctx);          // user or null
const user = await requireAuth(ctx);             // throws if not signed in
const user = await requireAdmin(ctx);            // throws if not admin
```

### Permissions

```ts
import { requireCan, currentUserCan } from "../../helpers/permissions";

const user = await requireCan(ctx, "event.create");   // throws if missing cap
const canDo = await currentUserCan(ctx, "event.update");
```

### Events (audit log + downstream listeners)

```ts
import { emitEvent } from "../../helpers/events";

await emitEvent(ctx, EVENT_CODE, SYSTEM_CODE, payload);
```

Event constants live in `convex/events/constants.ts`. If your
extension needs new event codes, add them there (e.g.,
`EVENTS.EVENT_CREATED`).

### Plugin gating (server-side)

```ts
import { requirePluginEnabled } from "../../helpers/plugins";

await requirePluginEnabled(ctx, "events");   // throws if plugin disabled
```

---

## Settings system (server-side, for extension-specific settings)

Extensions can have their own settings section. Use the settings
system rather than rolling your own.

```ts
import { api } from "../../_generated/api";

const settings = await ctx.runQuery(api.settings.queries.getBySection, {
  section: "events",                          // by convention, matches extension id
});

await ctx.runMutation(api.settings.mutations.updateSection, {
  section: "events",
  values: { ... },
});
```

---

## Client-side helpers (used by extension admin UI)

### Capability checks

```ts
import { useCan } from "@/hooks/useCan";
const canCreate = useCan("event.create");
```

### Plugin gating (route render)

```tsx
import { PluginGuard } from "@/components/plugins/PluginGuard";

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

### Convex queries / mutations

```ts
import { useQuery } from "convex-helpers/react/cache";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";

const events = useQuery(api.extensions.events.queries.list, { ... });
const createEvent = useMutation(api.extensions.events.mutations.create);
```

---

## What you import — NOT modify

In v2, the following files are **read-only from an extension's
perspective**. The scanner discovers and merges; you never touch:

- `packages/backend/convex/schema.ts` — main hub
- `packages/backend/convex/schema/_extensionsIndex.generated.ts` — autogen
- `apps/web/src/lib/plugins/registry.ts` — scanner appends to it
- `apps/web/src/lib/admin-shell/nav-config.ts` — scanner appends to it

If you find yourself wanting to modify any of these, you've slipped
into v1 thinking. Use the manifest + nav + schema pattern instead.

---

## Capability registry (read-only for extensions)

Capabilities are managed by `/experts:role-capability-system`. Your
extension defines what caps it needs and uses them via `requireCan`,
but does NOT add them to the central registry. Surface new caps in
your generation report; the Role expert handles registration.

Naming convention: `<resource>.<action>`. Examples:
- `event.create`, `event.update`, `event.delete`, `event.publish`
- `event.view_unpublished`
- `event.manage_settings`

---

## CLI for inspection

```bash
# From admin backend folder:
cd ConvexPress-Admin/packages/backend

# Inspect existing settings
bunx convex run settings:queries:getBySection '{"section":"pluginSettings"}'

# Test your extension's queries (after first deploy)
bunx convex run extensions:<id>:queries:list '{"paginationOpts":{"numItems":3,"cursor":null}}'
```

The colon path in CLI mirrors the folder structure:
`extensions:<id>:queries:list` → `convex/extensions/<id>/queries.ts:list`.

---

## What is NOT available

| Tempting | Reality |
|---|---|
| `api.extensions.register()` | No runtime registration. Scanner-based, build-time. |
| Modifying `ADMIN_PLUGINS` directly | The scanner builds it. Don't touch. |
| Adding capabilities at runtime | Capabilities are registry-driven. Role expert manages. |

---

## When in doubt

1. Read a similar existing v2 extension if one exists, OR study a v1
   platform extension (`recipes`, `gallery`) to understand the
   per-system structure.
2. If a helper you need doesn't exist, that's a real gap — surface it
   in the report. Don't fake the call.
