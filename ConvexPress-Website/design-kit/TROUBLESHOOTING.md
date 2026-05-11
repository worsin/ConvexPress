# Troubleshooting

Failure modes you'll hit when running `design:*` skills, and what to do
about each. Each section follows the same shape:

- **Symptom** — what you see
- **Cause** — what's actually wrong
- **Fix** — how to resolve, in order from least to most invasive

---

## 1. "Could not find function" from Convex

**Symptom**
```
✖ Failed to run function "settings:queries:getBrand":
  Could not find function for 'settings:queries:getBrand'.
```

**Cause**
You're calling a function that doesn't exist on the admin backend. The
kit had several wrong names in early drafts (e.g., `getBrand`,
`getSiteIdentity`, `posts:queries:listFeatured`).

**Fix**
1. Open `DATA-API.md`. Look up the correct path for your intent.
2. Common substitutions:
   - `settings:queries:getBrand` → `settings:queries:getBySection '{"section":"brand"}'`
   - `settings:queries:getSiteIdentity` → `settings:queries:getBySection '{"section":"general"}'`
   - `posts:queries:listFeatured` → `posts:queries:getSticky`
   - `products:queries:*` → `commerce:products:*`
   - `categories:queries:*` → `commerce:categories:*` (products) or `taxonomies:queries:*` (post categories)
   - `menus:queries:getByLocation` → `menus:queries:getMenuForLocation`
3. If the function genuinely doesn't exist anywhere, that's a backend
   gap. Surface it in the generation report. **Don't fabricate the call
   in the template** — it will compile but error at runtime.

---

## 2. Brand doc returns null

**Symptom**
```bash
$ bunx convex run settings:queries:getBySection '{"section":"brand"}'
null
```

**Cause**
`design:brand-discovery` has never been run for this site.

**Fix**
Run it now:
```
design:brand-discovery
```

Don't try to proceed with a template generation against a null brand
doc. Every per-route skill is supposed to halt in this case and tell
you to do brand discovery first; if a skill doesn't do that, the skill
itself is broken — flag it.

---

## 3. Skill ran but the file looks generic / unbranded

**Symptom**
The generated template compiles and renders, but it looks identical to
the reference example or to a previous run — none of the brand fields
seem reflected.

**Cause**
One of three things:
1. The skill skipped reading the brand doc (rare; means the skill file
   is buggy).
2. The brand doc has only a `moodPrompt` and no actionable pins, and
   the skill played it safe with neutral output.
3. The reference's visuals leaked into the output because Claude
   over-copied.

**Fix**
1. Inspect the brand doc: `bunx convex run settings:queries:getBySection '{"section":"brand"}'`. If `moodPrompt` is vague ("clean and modern"), update with `design:brand-discovery` to add specifics.
2. Add `palette`, `typography`, or `density` pins to force opinionated
   visual choices.
3. Re-run the skill. If it still looks identical, the issue is in the
   skill prompt — flag for refinement.

---

## 4. Type errors after generation

**Symptom**
```
$ bun --filter web check-types
src/routes/_marketing/blog/$slug.tsx(45,12): error TS2339: Property
  'foo' does not exist on type 'PostDetail'.
```

**Cause**
The generated template accessed a field that doesn't exist on the data
returned by the query. Most often:
- The reference example used a placeholder field name.
- The schema changed and the skill doesn't know yet.
- The skill misread the data shape.

**Fix**
1. **First instinct**: read the actual Convex schema file for the
   resource at `ConvexPress-Admin/packages/backend/convex/schema/<system>.ts`.
   Confirm the field exists there.
2. If the field doesn't exist: fix the template — use the correct
   field name, or remove the broken section if no equivalent exists.
3. If the field DOES exist on the schema but TypeScript can't see it,
   the generated types are stale. Run `cd ConvexPress-Admin/packages/backend && bunx convex dev` once to regenerate, then re-typecheck.
4. Don't `@ts-ignore` to silence. The type error is the bug.

---

## 5. Page renders blank with no console errors

**Symptom**
You navigate to the generated route, see a blank page, but the browser
console is clean.

**Cause**
Most common: the loader prefetches a query, but the component uses a
*different* query key (or args). React Query treats them as different
caches → re-fetches client-side → flash of empty layout while the
fetch happens → in dev/HMR the timing can leave the page blank.

**Fix**
1. Open the generated file. Compare the loader's
   `convexQuery(api.x, args)` calls to the component's
   `useTanStackQuery(convexQuery(api.x, args))` calls.
2. **The function AND args must match byte-for-byte** for query-key
   dedupe to work.
3. If they match: check the component for an early return that swallows
   the result (e.g., `if (!data) return null` when `data` is `[]`).

---

## 6. Generated file imports from a deprecated module

**Symptom**
```
import { IndexTemplate } from "@/templates/IndexTemplate";
```
…appears in a freshly-generated file.

**Cause**
The skill leaked through some other code Claude was reading
(`grep` results, deprecated routes still on disk).

**Fix**
1. Delete the import.
2. Re-implement whatever it was trying to do from scratch using the
   reference examples + the brand doc.
3. The CONTRACTS.md "must not include" list spells the forbidden
   imports. The skill should refuse to include them — if it didn't,
   note that in the report.

---

## 7. "I don't know which skill to use"

**Symptom**
A user says "design X" and you can't match it to a skill.

**Fix**
1. Re-read each `SKILL.md`'s `description:` frontmatter. Skill matching
   is description-based.
2. If no skill matches, the request is either:
   - Not a design task (it's admin or content work — say so)
   - A gap in the kit (a content type without a corresponding skill)
3. If it's a gap, tell the user. Don't shoehorn it into the wrong skill.

---

## 8. Generation receipt fails

**Symptom**
```
✖ Failed to run function "designKit:mutations:recordGeneration":
  Could not find function.
```

**Cause**
The admin backend doesn't expose a generation-receipt mutation yet.
This is expected — every skill has a fallback.

**Fix**
Write the receipt to `design-kit/.generations.log.jsonl` instead:

```jsonl
{"ts":"2026-05-11T15:24:00Z","route":"/","skill":"design:homepage","filePath":"apps/web/src/routes/_marketing/index.tsx","brand":{...},"notes":"..."}
```

(One JSON object per line, append-only.) The admin will reconcile this
log once the mutation lands on the backend side.

---

## 9. Skill seems to be re-reading the same files every step

**Symptom**
The skill is verbose; it reads `ARCHITECTURE.md` over and over even
though you already read it in this session.

**Cause**
Skills don't track session state. They prescribe a workflow that's
correct from a cold start; from a warm start, you can skip steps.

**Fix**
Use judgment. If you've genuinely read the kit constitution in this
session, you don't need to re-read it for the second skill invocation.
But "genuinely" is the keyword — don't skip because you assume you
know the patterns from training. The kit is the source of truth.

---

## 10. The deprecated theme system tries to be helpful

**Symptom**
You're reading old admin code and notice helpers like `theme-context`,
`template-registry`, `LayoutComposer`, `ThemeGallery`, etc.

**Cause**
Those exist as deprecated code, kept around with `@deprecated` headers.
They're not part of the active system.

**Fix**
**Ignore them.** Don't import from them, don't model new code after
them. The whole point of this kit is that those abstractions limit
what each site can look like, and we're not using them. If you find
yourself drawn to that code, re-read README.md.

---

## When in doubt

1. Read the relevant kit doc first (always).
2. Verify the actual API in `DATA-API.md`.
3. If you're guessing, stop and surface the uncertainty in your
   generation report rather than producing a confidently-wrong file.

Confidently-wrong code is the failure mode this kit is built to
prevent. Honest "I don't know, here's what I'd verify next" beats
fabrication every time.
