# Extension Contracts (v2)

The validation checklist. An extension is "done" only when every item
below holds. Treat each as a hard requirement.

`ARCHITECTURE.md` describes the 5 v2 layers + capabilities. This doc
turns each into a verifiable rule.

---

## 1. Schema (Layer 1)

- [ ] File at `packages/backend/convex/extensions[.local]/<id>/schema.ts`
  exists (either `extensions/` for official or `extensions.local/` for user)
- [ ] Exports a `tables` named export (the record of Convex
  `defineTable(...)` calls). The codegen scanner uses this name.
- [ ] Every table has at least one explicit index
- [ ] Table names are globally unique (grep `convex/schema/` and both
  `convex/extensions/` roots to confirm)
- [ ] No `v.any` without inline justification
- [ ] You do NOT edit `packages/backend/convex/schema.ts` or the
  generated index file

---

## 2. Queries (Layer 2)

- [ ] File at `packages/backend/convex/extensions[.local]/<id>/queries.ts`
  exists
- [ ] At minimum, exports `list` (admin paginated) and `getBySlug`
  (public single) — or domain-appropriate equivalents
- [ ] Public-safe queries explicitly project fields — no raw doc returns
- [ ] Paginated queries accept `paginationOpts`
- [ ] Convex API path will be `api.extensions.<id>.queries.*`

---

## 3. Mutations (Layer 3)

- [ ] File at `packages/backend/convex/extensions[.local]/<id>/mutations.ts`
  exists
- [ ] **Every** mutation handler calls `requireCan(ctx, "<capability>")`
  at the top — no exceptions
- [ ] Inputs validated with `v.*` validators
- [ ] State-changing mutations emit `emitEvent` for the audit log
- [ ] Soft-delete preferred over hard-delete

---

## 4a. Manifest (Layer 4)

- [ ] File at `apps/web/src/extensions[.local]/<id>/manifest.ts` exists
- [ ] Default-exports an `AdminPluginDefinition`
- [ ] `id` matches the extension's folder name (camelCase)
- [ ] `settingsKey` follows convention: `<id>Enabled`
- [ ] `navSectionIds` matches the `id` of the section in your `nav.ts`
  (if one exists)
- [ ] `adminAccessPrefixes` covers every admin URL the extension exposes
- [ ] `routePrefixes` lists public URL prefixes (or `[]` if none)
- [ ] `defaultEnabled` set (or omitted; default is `false`)
- [ ] Icon imported from `lucide-react`

## 4b. Nav (Layer 4, optional)

If the extension has a sidebar presence:

- [ ] File at `apps/web/src/extensions[.local]/<id>/nav.ts` exists
- [ ] Default-exports an `AdminNavSection`
- [ ] `id` matches the manifest's `navSectionIds[0]`
- [ ] `pluginId` is set to the extension's id (enables auto-hide when
  the extension is disabled)
- [ ] `capability` set to a sensible top-level cap
- [ ] `children` list the routes the extension exposes

If the extension has NO sidebar presence (rare):

- [ ] `nav.ts` is omitted entirely
- [ ] Manifest's `navSectionIds: []`

---

## 5. Admin UI routes (Layer 5)

- [ ] Routes live under
  `apps/web/src/routes/_authenticated/_admin/<route-prefix>/`
  (NOT under `extensions[.local]/`)
- [ ] Each route uses `createFileRoute` (TanStack Router)
- [ ] For toggleable extensions: every admin route is wrapped with
  `<PluginGuard pluginId="<id>">` or has `requirePluginEnabled` in
  `beforeLoad`
- [ ] Reuses existing list-table / settings / editor primitives
- [ ] All interactive UI from `@base-ui/react` — never `@radix-ui/*`
- [ ] Content management uses full-page navigation, not modals
- [ ] No hardcoded color literals (uses CSS variables)
- [ ] Routes are untracked (user extensions) or tracked (official
  extensions) — they survive update cycles either way

---

## 6. Capabilities (separate concern)

- [ ] Every new capability the extension uses is **listed** in the
  generation report (the Role expert adds them to the central registry;
  this skill just surfaces them)
- [ ] All five built-in roles considered: report should state which
  roles get the new capability and which don't
- [ ] No mutation, query, or route is gated by `isInternal === true`
  alone — capability checks are mandatory

---

## 7. What you do NOT touch (v2 invariant)

These files **must not be modified by an extension**:

- ❌ `packages/backend/convex/schema.ts` (hub)
- ❌ `packages/backend/convex/schema/_extensionsIndex.generated.ts` (autogen)
- ❌ `apps/web/src/lib/plugins/registry.ts` (only the scanner appends)
- ❌ `apps/web/src/lib/admin-shell/nav-config.ts` (only the scanner appends)

If you find yourself wanting to edit any of these, you're using the v1
pattern. Stop and reread `ARCHITECTURE.md`.

---

## 8. Codegen + typecheck

- [ ] `bun run codegen:extensions` (in `packages/backend/`) succeeds
  and writes a valid generated index
- [ ] `bun --filter web check-types` (in `ConvexPress-Admin/`) exits 0
- [ ] Schema index file is consistent with on-disk extensions

---

## 9. Generation report

After generating an extension, the skill writes a report covering:

- All files created (paths, both backend and frontend)
- Whether the extension is "official" (committed to upstream) or
  "user" (lives in `.local/`)
- New capabilities the Role expert needs to add, with grant
  recommendations per role
- Whether the extension exposes a public Website surface (and if so,
  handoff to `/design:custom-post-type` in the Website repo)
- Codegen + typecheck pass confirmation
- Deploy instructions for the Convex Deployment Expert
  (`bun run deploy` in `packages/backend/` runs codegen + convex deploy)
- Any deviations from the kit standard, with justification

---

## 10. The "don't"s (refreshed for v2)

- ❌ Don't deploy. Code-written + types-pass; deploy is the Convex
  expert's job
- ❌ Don't add capabilities to the central role registry. Surface them;
  Role expert registers
- ❌ Don't generate Website-side routes. Hand off to design-kit
- ❌ Don't modify any of the hub files listed in §7. v2 is additive only.
- ❌ Don't put admin routes under `extensions[.local]/`. They go in
  `apps/web/src/routes/_authenticated/_admin/<prefix>/`
- ❌ Don't put schema or queries under `apps/web/`. Backend lives in
  `packages/backend/convex/`
- ❌ Don't commit anything inside `extensions.local/`. Per-folder
  `.gitignore` prevents this, but be aware

---

## 11. Dashboard contributions (optional)

Only when the extension adds customer-dashboard pages or widgets:

- [ ] File at `packages/backend/convex/extensions[.local]/<id>/dashboard.ts`
  exists and exports `pages` and/or `widgets` (named exports — the
  codegen scanner uses these names). Pure TypeScript: no Convex imports.
- [ ] Every entry's `id` is globally unique across
  `DASHBOARD_PAGES` / `DASHBOARD_WIDGETS` (grep `registry.ts` and every
  other `dashboard.ts`). Ids are stable — menus and saved layouts key on them.
- [ ] `pluginId` is the extension id (so `pluginIsEnabled` hides the
  entries when the extension is off); `icon` is a lucide kebab-case name.
- [ ] Pages: `path` is unique under the dashboard base path, `group` is
  one of overview/activity/commerce/learning/support/account,
  `defaultInSidebar` is set; `badge` (if any) is one of `BADGE_SOURCES`.
- [ ] Widgets: `sizes` lists only sizes the widget renders well at,
  `defaultSize` is in `sizes`, `defaultInHome` is set, `category` is
  set; every `settings` entry has `key`, `label`, `kind`, `defaultValue`
  (and `min`/`max` for numbers, `options` for selects).
- [ ] `bun run codegen:extensions` regenerates
  `convex/schema/_dashboardIndex.generated.ts` and lists the extension.
- [ ] The website has a matching module per id at
  `ConvexPress-Website/apps/web/src/dashboard/{pages|widgets}/<id>/manifest.tsx`
  following `apps/web/src/dashboard/contracts.ts` — or the report says
  the website half is still pending.
- [ ] You did NOT edit `registry.ts` or the generated dashboard index.

### Menu items that point at the dashboard

- [ ] Dashboard menu items use `itemType: "dashboard"` with `objectId` =
  page id; never hard-code `/dashboard/...` URLs (the base path is a
  setting and `pathOverride` can replace it per item).
- [ ] `badge` values come from `BADGE_SOURCES`; `icon` matches
  `^[a-z0-9-]{1,64}$`; `pathOverride` matches
  `^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$`.
- [ ] Visibility is expressed with `visibility` / `roles` /
  `membershipPlans` / `capability`, never by duplicating menus per role.
