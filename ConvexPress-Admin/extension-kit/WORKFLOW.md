# Workflow — building a new extension end-to-end

The execution order for `extension:build`. Follow these phases in order;
each builds on the previous. Skipping ahead = an extension that
half-works.

---

## Phase 0 — Prerequisites & inputs

Before generating any code, gather:

1. **Extension id** (camelCase, e.g., `events`, `caseStudies`,
   `inventory`). Must be unique — check `AdminPluginId` in
   `apps/web/src/lib/plugins/registry.ts` to confirm.
2. **Display title** (e.g., "Events")
3. **One-line description** (for the `/plugins` toggle page)
4. **Lucide icon name** (suggest one based on the domain)
5. **Tables** the extension owns (names + main fields). At minimum,
   one primary table.
6. **Whether it has a public surface** (the Website renders it). If
   yes, what URL prefix.
7. **Whether it depends on another extension** (e.g., subscriptions
   depends on commerce).
8. **Capabilities the extension defines** (e.g., `event.create`,
   `event.publish`).
9. **Default-enabled state** (most extensions default to `false`;
   built-in essentials may default to `true`).

If any of these are unclear, ASK the user before generating. Don't
fabricate.

---

## Phase 1 — Read the kit

1. `extension-kit/README.md`
2. `extension-kit/ARCHITECTURE.md` (especially the 7-layer overview)
3. `extension-kit/CONTRACTS.md`
4. `extension-kit/DATA-API.md`
5. The relevant reference files in `extension-kit/references/`
6. Look at an EXISTING similar extension in the codebase for a real
   example. Good models to study: `recipes`, `gallery`, `kb`. Read
   one end-to-end before generating your new one.

---

## Phase 2 — Schema (Layer 1)

1. Create `packages/backend/convex/schema/<extension>.ts`
2. Define every table the extension owns
3. Add a named exports object (e.g., `eventsTables`)
4. Modify `packages/backend/convex/schema.ts` to import + spread the
   new tables object

**Verify:** the file is syntactically valid TS. (Full typecheck comes
later.)

---

## Phase 3 — Queries + Mutations (Layers 2-3)

1. Create the folder: `packages/backend/convex/<extension>/`
2. Create `queries.ts` with at minimum: `list`, `getBySlug`,
   plus any other reads the admin UI needs
3. Create `mutations.ts` with: `create`, `update`, `remove` (or soft
   delete equivalent), plus extension-specific mutations
4. Every mutation handler MUST start with `requireCan(ctx, "<capability>")`
5. State-changing mutations MUST emit at least one event via
   `emitEvent(...)`

Don't deploy yet. Convex `_generated/api` types regenerate on next
deploy.

---

## Phase 4 — Admin UI routes (Layer 4)

1. Create the folder:
   `apps/web/src/routes/_authenticated/_admin/<extension>/`
2. Create at minimum:
   - `index.tsx` — list page
   - `new.tsx` or `$<id>/edit.tsx` — create/edit page
   - `settings.tsx` — if the extension has settings
3. Each route uses `createFileRoute` + (for toggleable extensions)
   wraps content with `<PluginGuard pluginId="<id>">`
4. Use existing primitives:
   - List tables: study how `posts/index.tsx` and `commerce/products.tsx`
     compose list, sort, bulk actions, filters
   - Settings forms: `SettingsPageLayout` + `SettingsSection` + `SettingsField`
   - Editor screens: `EditorLayout` from `@/components/editor`

---

## Phase 5 — Plugin registry (Layer 5)

Modify `apps/web/src/lib/plugins/registry.ts`:

1. Add the new id to `AdminPluginId` union (string literal)
2. Add `<id>Enabled: boolean` to `PluginSettingsValues` interface
3. Push a new `AdminPluginDefinition` onto `ADMIN_PLUGINS` with:
   - `id`, `title`, `description`, `icon`
   - `settingsKey: "<id>Enabled"`
   - `navSectionIds`: array containing the nav section id (Layer 6)
   - `adminAccessPrefixes`: ["/<extension>"] (or whatever URL prefix
     the admin routes use)
   - `routePrefixes`: ["/<public-url-prefix>"] if it has a public
     surface; `[]` otherwise
4. Add `<id>Enabled` to `DEFAULT_PLUGIN_SETTINGS` with the default
   boolean
5. If dependency: add to `PLUGIN_PARENT`

**Verify:** the AdminPluginId union exhaustiveness checks pass. If TS
complains anywhere about a missing case, fix it (don't `// @ts-ignore`).

---

## Phase 6 — Admin nav (Layer 6)

Modify `apps/web/src/lib/admin-shell/nav-config.ts`:

1. Import the Lucide icon
2. Add a new entry to `ADMIN_NAV_SECTIONS` with:
   - `id` — matches the registry's `navSectionIds[0]`
   - `label`, `to`, `icon`
   - `pluginId: "<id>"` — **mandatory** for toggleable extensions
   - `capability` — the highest required cap among children
   - `children` — array of links matching the routes created in Phase 4

**Verify:** browse to `/plugins` and toggle the extension; the new nav
section should appear/disappear.

---

## Phase 7 — Capabilities (Layer 7)

The extension defines what capabilities it uses (Phases 3 + 4); the
Role expert adds them to the central registry.

1. List every new capability the extension uses in the generation
   report
2. For each, recommend which built-in roles should get it by default:
   - Administrator: usually yes
   - Editor: usually for content-management caps
   - Author: usually for own-content caps
   - Contributor: usually for draft-only caps
   - Subscriber: rarely
3. Note in the report: "Invoke `/experts:role-capability-system` to add
   these to the central registry before the extension is fully gated."

---

## Phase 8 — Compile + verify

```bash
cd ConvexPress-Admin
bun --filter web check-types
```

Must exit 0. Any TS errors get fixed in-place before declaring done.

Convex's generated types will be stale until next deploy — that's
expected. If you see errors specifically about `api.<extension>.queries.X`
not existing, those resolve after `npx convex deploy --typecheck=disable`.
**You don't run the deploy yourself** — surface this in your report so
the Convex Deployment Expert runs it.

---

## Phase 9 — Report

Write a clear report:

- All files created (paths)
- All files modified in place (registry, nav-config, schema hub)
- New capabilities the Role expert needs to add, with role grant
  recommendations
- Whether a public Website surface exists, and if so a clear handoff to
  `/design:custom-post-type` in the Website repo
- Deploy instructions for the Convex Deployment Expert
- Any deviations from the kit standard, with justification

---

## When to invoke `extension:add-feature` instead

Don't use `extension:build` to add functionality to an existing
extension. Use `extension:add-feature` — it knows which extension already
exists, doesn't duplicate registry entries, and only adds the new
mutation / query / route / capability you need.

---

## When to invoke `extension:audit` instead

If something feels off about an existing extension (nav not hiding,
mutations not gated, settings not respected), don't rebuild — audit.
`extension:audit` walks an existing extension's 7 layers and reports
gaps without modifying anything.
