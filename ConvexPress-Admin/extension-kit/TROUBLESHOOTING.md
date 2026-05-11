# Troubleshooting (v2)

Failure modes you'll hit with the v2 scanner-based architecture, and
what to do about each.

---

## 1. Extension's tables don't appear after deploy

**Symptom**
Convex deploy succeeds but your new extension's tables don't show up
when you query them, and admin pages show "table not found" errors.

**Cause**
The generated schema index is stale or missing. The codegen script
didn't run before `convex deploy`.

**Fix**
1. Run codegen manually:
   ```bash
   cd ConvexPress-Admin/packages/backend
   bun run codegen:extensions
   ```
2. Verify the output:
   ```bash
   cat convex/schema/_extensionsIndex.generated.ts
   ```
   Should contain an `import` for your extension's `schema` and an
   entry in `extensionTables`.
3. Re-deploy: `bun run deploy` (which runs codegen + `convex deploy`).
4. If you used `bunx convex deploy` directly, switch to `bun run deploy`
   so codegen always runs first. Document this for operators.

---

## 2. Manifest scanner can't find your extension

**Symptom**
`/plugins` page doesn't show your extension as a toggleable feature.
The plugin settings still default to `false`. Your nav section doesn't
appear in the sidebar.

**Cause**
Vite's `import.meta.glob` didn't pick up your manifest. Most common
reasons:
1. File path is wrong — manifest must be at
   `apps/web/src/extensions[.local]/<id>/manifest.ts` (no other depth)
2. The manifest doesn't have a `default` export
3. The dev server / build needs a fresh pass to pick up the new glob

**Fix**
1. Confirm the file is at the right path
2. Confirm the export pattern:
   ```ts
   const manifest: AdminPluginDefinition = { ... };
   export default manifest;
   ```
3. Restart `bun run dev:web` — Vite's `import.meta.glob` is evaluated
   at module-load time and may not hot-reload new manifest files (it
   should, but worst case is a restart)
4. Check the browser DevTools console for any module-loading errors

---

## 3. Nav section appears but extension toggle hides it via plugin guard, even when enabled

**Symptom**
The extension is toggled ON at `/plugins`, but its nav section is
still hidden in the sidebar.

**Cause**
The `nav.ts` `AdminNavSection.pluginId` doesn't match the manifest's
`id`. The auto-hide logic relies on string-equality on the id.

**Fix**
- Open `apps/web/src/extensions[.local]/<id>/manifest.ts` — check `id` field
- Open `apps/web/src/extensions[.local]/<id>/nav.ts` — check `pluginId` field
- Both must be the same string

---

## 4. Admin route loads even when extension is disabled

**Symptom**
You can navigate directly to `/yourExtension/...` even after disabling
in `/plugins`.

**Cause**
The route component isn't wrapped with `<PluginGuard>`.

**Fix**
Wrap each route's component:
```tsx
import { PluginGuard } from "@/components/plugins/PluginGuard";

function MyExtensionPage() {
  return (
    <PluginGuard pluginId="<id>">
      <MyExtensionContent />
    </PluginGuard>
  );
}
```

This is **non-negotiable** per CONTRACTS.md §5.

---

## 5. `requireCan is not defined` / mutation runs without capability check

**Symptom**
A mutation is callable by users who shouldn't be able to. Or
TypeScript flags a missing import.

**Cause**
You forgot to import + call `requireCan` at the top of the mutation
handler. Note the import path depth:

```ts
// In packages/backend/convex/extensions[.local]/<id>/mutations.ts:
import { requireCan } from "../../helpers/permissions";  // two `../`
```

**Fix**
Every mutation starts with:
```ts
handler: async (ctx, args) => {
  const user = await requireCan(ctx, "<extension>.<action>");
  // ...
}
```

---

## 6. "api.extensions.\<id\>.queries.X" not in `api` type

**Symptom**
Compile error like `Property 'extensions' does not exist on type ...`
when calling your extension's queries from the admin UI.

**Cause**
Convex's `_generated/api.d.ts` is stale — types regenerate on next
deploy.

**Fix**
1. Don't deploy yourself — surface in the generation report
2. The Convex Deployment Expert (`/experts:convex-deployment`) runs
   `bun run deploy` which kicks off codegen + Convex deploy
3. If you're in dev and `convex dev` is running, types should refresh
   automatically when files change

---

## 7. `git reset --hard` wiped your work

**Symptom**
You worked on an extension; an update ran via the in-app updater; now
your extension is gone.

**Cause(s)** — pick one:

- **A** — You put the extension in `extensions/` instead of `extensions.local/`.
  The `extensions/` folder is tracked; `git reset --hard origin/<branch>`
  reset your local additions there.

  **Fix:** Move the extension to `extensions.local/`. Re-run codegen.

- **B** — You modified one of the hub files (`schema.ts`,
  `registry.ts`, `nav-config.ts`) — those are tracked, so reset wiped
  your modifications. You weren't using v2; you reverted to v1
  behavior.

  **Fix:** Move your registration into the extension's own
  `manifest.ts` / `nav.ts` / `schema.ts` files under
  `extensions.local/<id>/`. The scanner picks them up.

- **C** — Routes you added under `apps/web/src/routes/_authenticated/_admin/<prefix>/`
  were tracked because someone committed them. Untracked routes
  survive; tracked ones don't.

  **Fix:** If routes were committed locally (uncommon for user
  extensions), back them up before update. Better long-term: ensure
  the workflow keeps user route files untracked.

---

## 8. Codegen failed mid-update

**Symptom**
The in-app updater shows a "regenerating-extensions" warning but
continues to build. After build, extensions don't work.

**Cause**
The codegen step failed (syntax error in a `schema.ts`, missing import,
etc.) and the updater fell through to the build step with a stale or
empty generated index.

**Fix**
1. After update completes, run codegen manually and read the error:
   ```bash
   cd ConvexPress-Admin/packages/backend
   bun run codegen:extensions
   ```
2. Fix the offending extension's `schema.ts`
3. Re-run codegen
4. Rebuild: `bun --filter web build` (or restart the dev server)

The updater intentionally doesn't fail-the-whole-update on codegen
errors — it warns and continues. This is so a single bad user
extension doesn't block a platform update.

---

## 9. "I don't know which root to use"

**Symptom**
Building a new extension and unsure whether it goes in `extensions/`
or `extensions.local/`.

**Fix**
- **`extensions/`** — you're the maintainer of ConvexPress and this
  extension will ship with the platform. Commit + push it upstream.
- **`extensions.local/`** — you're an operator on a self-hosted install
  who's adding functionality just for your install. Don't commit; this
  folder is gitignored.

If you're not sure, default to `extensions.local/`. You can always
move it to `extensions/` later if you decide to upstream it.

---

## 10. Multiple extensions with the same id

**Symptom**
Two extensions both named `events` — one in `extensions/`, one in
`extensions.local/`. Scanner picks up both, but only one wins, behavior
is unpredictable.

**Cause**
Id collisions across the two roots. The scanner doesn't currently
de-dupe; it concatenates lists.

**Fix**
Don't name a local extension the same as an existing official one.
Pick a unique id. The `extension:build` skill validates this in
Phase 0 — if you're hitting this, you bypassed the check.

---

## 11. The deprecated v1 hand-edited hubs

**Symptom**
You're reading the existing platform extensions (commerce, kb,
recipes, gallery, etc.) and notice they're hand-edited into
`registry.ts`, `nav-config.ts`, and `schema.ts`. You wonder if v2 is
breaking them.

**Cause**
It isn't. v1 platform extensions and v2 scanner-discovered extensions
coexist. Both sources are merged into the running registries.

**Fix**
Nothing to fix. Use v2 for new extensions; leave v1 platform
extensions alone until/unless a separate migration is planned.

---

## When in doubt

1. Read the relevant kit doc first.
2. Verify the actual API in `DATA-API.md`.
3. Run `extension:audit` on the suspect extension — it walks the v2
   5-layer contract and reports gaps without modifying anything.
4. Honest "I don't know, here's what I'd verify next" beats
   fabrication.
