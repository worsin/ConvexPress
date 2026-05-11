---
name: extension-add-feature
description: Use when the user asks to add a new feature, function, mutation, query, route, or capability to an existing extension. Triggers on "add bulk delete to events", "add a new admin page to gallery", "the recipes extension needs an import button", "extend the kb extension with X". Modifies the existing extension's files in place; does NOT re-scaffold the extension or duplicate registry entries.
---

# extension-add-feature

You are adding functionality to an extension that already exists.
Output: additions / modifications inside the existing extension's files
+ a clear report.

This skill is the surgical counterpart to `extension-build`. Don't
re-create the schema or registry entries — the extension is already
registered. Just slot the new feature into the right files.

## Prerequisites

Confirm with the user:

- **Which extension** is being extended (the id, e.g., `events`)
- **What the feature is** (e.g., "bulk publish", "ICS export endpoint",
  "venue manager sub-screen")
- **What layers it touches** (a new mutation? a new admin route? both?
  a new capability?)

If unclear, ASK. Don't guess scope.

## Workflow

### Step 1 — Read the kit

In order:
1. `extension-kit/README.md`
2. `extension-kit/ARCHITECTURE.md` (skim — focus on layers the feature
   touches)
3. `extension-kit/CONTRACTS.md` (the rules still apply to anything you
   add)
4. `extension-kit/DATA-API.md`
5. The reference for each layer you're modifying

### Step 2 — Read the existing extension

Before writing anything, READ:
- `packages/backend/convex/schema/<ext>.ts` (current schema)
- `packages/backend/convex/<ext>/queries.ts`
- `packages/backend/convex/<ext>/mutations.ts`
- `apps/web/src/routes/_authenticated/_admin/<ext>/` (every file)
- The extension's entry in `apps/web/src/lib/plugins/registry.ts`
- The extension's section in `apps/web/src/lib/admin-shell/nav-config.ts`

Know what's already there. Match its style.

### Step 3 — Decide where the new code goes

**New schema field?** Patch the existing table in `schema/<ext>.ts`.
Add an optional field (`v.optional(...)`) so existing records remain
valid. Don't add required fields without a migration plan — flag that
in the report.

**New mutation?** Append to `mutations.ts`. Use the same patterns as
existing mutations. `requireCan(ctx, "<existing or new capability>")`
at the top.

**New query?** Append to `queries.ts`. Use existing index conventions.

**New admin route?** Add a new file under
`_authenticated/_admin/<ext>/`. Wrap in `<PluginGuard>`. Add a nav
entry under the existing section's `children` if the route should be
discoverable.

**New capability?** Use it in your new code. List it in the report
for the Role expert to register.

### Step 4 — Generate the additions

Write the new code following the same style as the existing extension.
Don't change formatting, naming conventions, or imports of unrelated
code.

### Step 5 — Modify the nav-config if needed

If the new feature is a new admin sub-route that the user should be
able to navigate to, add it as a child to the existing section in
`nav-config.ts`. If it's an action button on an existing list (e.g.,
"Bulk publish"), no nav change is needed.

### Step 6 — Verify

```bash
cd ConvexPress-Admin
bun --filter web check-types
```

Must exit 0. Generated types may be stale for new queries/mutations —
expected, surface in report.

### Step 7 — Report

Cover:
- Files modified (with paths) — the actual edits, not just paths
- New capabilities to register (if any)
- Schema migration concerns (if any)
- Whether existing tests still apply or need updates (note only — don't
  write tests in this skill)
- Deploy ask for `/experts:convex-deployment`

## Output contract

- Edits scoped to the existing extension's files
- No new files outside the extension's folders
- No registry-entry duplication
- CONTRACTS.md rules still satisfied for whatever layer you touched

## When NOT to use this skill

- **Building a brand new extension** → `extension:build`
- **Auditing whether an existing extension is correctly wired** →
  `extension:audit`
- **Adding capabilities to roles** → the Role expert handles the role
  registry; this skill uses caps but doesn't define them at the
  platform level.
- **Generating Website-side templates** → handoff to the design-kit in
  the Website repo.
