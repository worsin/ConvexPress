# Troubleshooting

Failure modes you'll hit building extensions, and what to do about each.

---

## 1. "Type 'X' is not assignable to type 'AdminPluginId'"

**Symptom**
```
error TS2322: Type '"yourExtension"' is not assignable to type 'AdminPluginId'.
```

**Cause**
You used the new extension's id somewhere but forgot to add it to the
`AdminPluginId` union in `apps/web/src/lib/plugins/registry.ts`.

**Fix**
Add `| "yourExtension"` to the union. TypeScript should then flow the
new value through all the case statements that handle `AdminPluginId`.

---

## 2. Extension shows in nav even when disabled

**Symptom**
Toggle the extension off at `/plugins`, the nav section is still there.

**Cause**
The nav section entry in `nav-config.ts` doesn't have `pluginId` set,
or the value doesn't match the registry's id.

**Fix**
1. In `nav-config.ts`, add `pluginId: "<exactRegistryId>"` to the
   section entry.
2. Confirm the registry's `navSectionIds[0]` is the same string as the
   nav section's `id`.

---

## 3. Admin route loads even when extension is disabled

**Symptom**
You can navigate directly to `/yourExtension/...` even after disabling
in `/plugins`.

**Cause**
The route component isn't wrapped with `<PluginGuard>` or doesn't call
`requirePluginEnabled` in `beforeLoad`.

**Fix**
Wrap each route's component in `<PluginGuard pluginId="<id>">…</PluginGuard>`
from `@/components/plugins/PluginGuard`. For SSR fail-closed behavior,
also add a `beforeLoad` that calls `requirePluginEnabled`.

---

## 4. "requireCan is not defined" / mutation runs without capability check

**Symptom**
A mutation is callable by users who shouldn't be able to call it. Or
TypeScript flags a missing import.

**Cause**
You forgot to import + call `requireCan` at the top of the mutation
handler.

**Fix**
```ts
import { requireCan } from "../helpers/permissions";

export const create = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "yourExtension.create");
    // ... rest of handler
  },
});
```

This is **non-negotiable** per CONTRACTS.md — every mutation MUST start
with a capability check.

---

## 5. "api.<extension>.queries.X" doesn't exist after generation

**Symptom**
You generated the queries file but `api.events.queries.list` shows up as
undefined / type error in admin UI components.

**Cause**
Convex's `_generated/api.ts` is stale — it regenerates on the next
deploy.

**Fix**
1. **Don't deploy yourself.** Surface this in the generation report and
   hand off to the Convex Deployment Expert via
   `/experts:convex-deployment`.
2. If you're in dev and the convex dev server isn't running, the types
   won't update until you run `npx convex dev` (which the user
   typically has running in another terminal).
3. As a temporary measure during dev, the convex dev server should
   auto-refresh types when it picks up the new file.

---

## 6. Schema deploy fails with "Could not find function" for cross-system reference

**Symptom**
After generating the extension, deploying Convex errors with something
like:
```
Could not find function for 'someOther:queries:get' referenced in <extension>/queries.ts
```

**Cause**
Your queries.ts references functions in another system that don't exist
yet, OR the file order in deploy isn't what you expect.

**Fix**
1. Verify the cross-system query exists in the admin backend.
2. If it doesn't, surface as a backend gap. Don't fake the call.
3. The legitimate Convex pattern during incremental builds is to deploy
   with `--typecheck=disable` — but that's the Convex Deployment
   Expert's call, not yours.

---

## 7. Settings page form doesn't save

**Symptom**
The extension's settings page accepts input but values don't persist.

**Cause**
Most common: form submits but doesn't call the right mutation, or the
mutation writes to the wrong section.

**Fix**
1. Confirm the settings page uses `useSettingsForm(<section>, schema)`
   where `<section>` is your extension's id.
2. Confirm `settings:mutations:updateSection` is being called with
   `section: "<extensionId>"`.
3. Check the `<section>` value matches what the settings registry
   expects (in `apps/web/src/lib/settings/registry.ts`).

---

## 8. Nav appears for users who shouldn't see it

**Symptom**
A role without the required capability still sees the extension's nav
entry.

**Cause**
The nav section's `capability` field is missing or wrong.

**Fix**
Set `capability: "<highestRequiredCap>"` on the section. The nav
filter ANDs section capability with the user's capabilities — missing
the cap hides the section.

---

## 9. Two extensions claim the same nav section id

**Symptom**
Toggling one extension off hides another extension's nav.

**Cause**
Two `AdminPluginDefinition` entries have overlapping `navSectionIds`,
OR the section in `nav-config.ts` has an `id` that two extensions
claim.

**Fix**
Each section id is owned by exactly one extension. Rename the colliding
section, update both the registry entry and the nav config to match.

---

## 10. Capability doesn't seem to do anything

**Symptom**
You added `requireCan(ctx, "newCap")` but the call always succeeds —
even for users who shouldn't have it.

**Cause**
The capability hasn't been added to the central role registry yet.
`requireCan` falls back to "allowed" when the cap doesn't exist in the
registry (or, depending on impl, fails everyone — verify with the Role
expert).

**Fix**
List the new capabilities in your generation report and invoke the
Role expert (`/experts:role-capability-system`) to add them. Don't
self-add to the registry — that's the Role expert's domain.

---

## 11. Extension works in admin but not on Website

**Symptom**
You shipped the admin side perfectly, but the matching public URL
404s or shows the wrong template.

**Cause**
Extension kit's job ended at admin. The Website-side templates haven't
been generated yet.

**Fix**
1. Invoke `/design:custom-post-type` in the Website repo, passing the
   extension's id as the CPT name.
2. That skill generates the archive + single routes for the public
   surface.
3. If the Website-side queries don't exist (e.g., your extension only
   exposes admin queries), you'll need to add public-safe queries to
   `<extension>/queries.ts` first.

---

## When in doubt

1. Read `ARCHITECTURE.md` again — most issues are a missing layer.
2. Run `extension:audit` on the extension; it walks all 7 layers and
   reports gaps without modifying anything.
3. If you can't reconcile what you see with what you expect, surface
   it in the generation report. Confidently-wrong code is worse than
   "I don't know, here's what I'd verify."
