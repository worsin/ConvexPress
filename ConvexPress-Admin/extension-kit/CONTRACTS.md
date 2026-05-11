# Extension Contracts

The validation checklist. An extension is "done" only when every item
below holds. Treat each as a hard requirement.

`ARCHITECTURE.md` describes the 7 layers; this doc turns each into a
verifiable rule.

---

## 1. Schema (Layer 1)

- [ ] File at `packages/backend/convex/schema/<extension>.ts` exists
- [ ] Exports a single named object (`<extension>Tables`) grouping every
  table the extension owns
- [ ] Object spread into the root `packages/backend/convex/schema.ts`
- [ ] Every table has at least one explicit index (none rely on the
  implicit `by_creation_time` for queryable fields)
- [ ] Table names are globally unique (grep the rest of the schema
  directory to confirm)
- [ ] Cross-system references use `v.id("<otherTable>")`, never plain
  `v.string`

---

## 2. Queries (Layer 2)

- [ ] File at `packages/backend/convex/<extension>/queries.ts` exists
- [ ] At minimum, exports `list` (admin paginated) and `getBySlug`
  (public single)
- [ ] Public-safe queries explicitly project fields — no raw doc returns
- [ ] Paginated queries accept `paginationOpts`
- [ ] No query returns secrets (api keys, internal flags) to public
  callers

---

## 3. Mutations (Layer 3)

- [ ] File at `packages/backend/convex/<extension>/mutations.ts` exists
- [ ] **Every** mutation handler calls `requireCan(ctx, "<capability>")`
  (or a stricter helper) at the top
- [ ] Inputs validated with `v.*` validators (never `v.any` unless
  absolutely necessary; if used, justified inline)
- [ ] State-changing mutations emit at least one event via `emitEvent`
  for the audit log to capture
- [ ] Soft-delete is preferred over hard-delete for user-facing content
  (use a `status` field; only hard-delete if no other system can
  reference the row)

---

## 4. Admin UI routes (Layer 4)

- [ ] Routes live under `apps/web/src/routes/_authenticated/_admin/<extension>/`
- [ ] Each route uses `createFileRoute` (TanStack Router)
- [ ] For toggleable extensions: every admin route is wrapped with
  `<PluginGuard pluginId="<id>">` or has a `beforeLoad` calling
  `requirePluginEnabled`
- [ ] List pages use existing list-table primitives (don't reinvent
  pagination + sort + bulk actions)
- [ ] Settings pages use the settings-form primitives
  (`SettingsPageLayout`, `SettingsSection`, `SettingsField`, etc.)
- [ ] All interactive UI from `@base-ui/react` — never `@radix-ui/*`
- [ ] Content management is full-page navigation — no modal-based
  editors. (Confirmation dialogs for destructive actions are the only
  allowed popup.)
- [ ] No hardcoded colors (use CSS variables: `bg-card`, `text-foreground`,
  etc.)

---

## 5. Plugin registry (Layer 5)

- [ ] Extension `id` added to `AdminPluginId` union in
  `apps/web/src/lib/plugins/registry.ts`
- [ ] `<id>Enabled: boolean` added to `PluginSettingsValues`
- [ ] New `AdminPluginDefinition` pushed onto `ADMIN_PLUGINS` with all
  required fields populated
- [ ] `DEFAULT_PLUGIN_SETTINGS` includes the `<id>Enabled` default
- [ ] If extension depends on another (e.g., commerce sub-features),
  added to `PLUGIN_PARENT` map
- [ ] `navSectionIds` value(s) MATCH the `id` of the corresponding nav
  section in `nav-config.ts` (Layer 6) — string-level equality

---

## 6. Admin nav (Layer 6)

- [ ] New entry added to `ADMIN_NAV_SECTIONS` in
  `apps/web/src/lib/admin-shell/nav-config.ts`
- [ ] `pluginId` field set to the extension's id (this is what auto-hides
  the section when the extension is disabled)
- [ ] `capability` set to the highest required capability among the
  section's children (so the whole section disappears for roles that
  can't access it)
- [ ] Children list at least the typical `list`, `Add New`, and
  `Settings` routes (where applicable)
- [ ] Icon imported from `lucide-react`; no SVG imports

---

## 7. Capabilities (Layer 7)

- [ ] Every new capability the extension uses is **listed** in the
  generation report (the Role expert adds them to the central registry;
  the extension just uses them)
- [ ] All five built-in roles considered: report should state which
  roles get the new capability and which don't
- [ ] No mutation, query, or route is gated by `isInternal === true` /
  `internalRole === "admin"` as the only check; capability checks
  are mandatory

---

## 8. Type union maintenance

- [ ] The `AdminPluginId` union type is exhaustive — TypeScript would
  catch a missing case if you used the type elsewhere; verify by
  running `bun --filter web check-types`
- [ ] No `as AdminPluginId` casts to bypass the union check

---

## 9. Generation report

After generating an extension, the skill writes a report that lists:

- All files created (with paths)
- All files modified in place (registry, nav-config)
- New capabilities the Role expert needs to add, with suggested role
  grants
- Whether the extension exposes a public surface (and if so, hand off
  to design-kit for Website-side templates)
- Any deviations from the kit standard (with justification)
- Convex deployment instructions: the file changes will require
  `npx convex deploy --typecheck=disable` or full type-check pass, and
  whether the Convex Deployment Expert should be invoked

---

## 10. The "don't"s

- ❌ Don't deploy. Your job ends at "code written + types pass."
- ❌ Don't add capabilities to the central role registry yourself.
  Surface them; let the Role expert add them.
- ❌ Don't generate Website-side routes. Hand off to design-kit via
  the report.
- ❌ Don't skip the registry entry — the extension WILL appear to work
  in dev (routes load) but will not be toggleable, which means it's
  broken at the platform level.
- ❌ Don't reuse another extension's id, capability namespace, or
  table names.
- ❌ Don't reach for `@ts-ignore` to silence type union errors after
  adding the new id — those errors mean a switch somewhere needs the
  new case.
