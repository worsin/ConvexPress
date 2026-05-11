---
name: design-data-audit
description: Use when the user asks to audit the front end against the data layer, check if templates still match the schema, verify data contracts, or ensure generated templates aren't pulling stale fields. Triggers on "audit the templates", "check the data contracts", "verify the front end matches the schema", "find broken queries". Reports which generated templates reference missing fields or queries.
---

# design-data-audit

You are auditing the **alignment between generated templates and the
current Convex schema**. Output: a report listing every template whose
data contract has drifted from the live admin backend. You don't fix
anything in this skill — fixes go through the relevant `design:*` skill.

## Why this skill exists

Templates are generated against the admin's Convex schema at a point in
time. When the schema changes (a field added, renamed, removed; a query
renamed; a new content type appears), generated templates can drift.
This skill catches that drift.

## Workflow

1. **Read** `design-kit/ARCHITECTURE.md` (specifically §7 "Data layer").

2. **List the generation receipts.** Try Convex first:
   ```bash
   bunx convex run designKit:queries:listGenerations
   ```
   If that doesn't exist, read `design-kit/.generations.log.jsonl` (the
   fallback location). If neither exists, you have no inventory — surface
   that and stop.

3. **For each generation receipt**, do the following:

   a. Open the generated file (path in receipt).
   b. Grep for every Convex query call. Patterns:
      - `convexQuery(api.X.queries.Y, ...)`
      - `useQuery(api.X.queries.Y, ...)`
      - `useQuery(api.X.Y, ...)`
   c. For each call, verify:
      - The query path exists in the admin backend
        (`ConvexPress-Admin/packages/backend/convex/<system>/queries.ts`
        or similar).
      - The args shape matches what the query expects.
   d. Grep for field accesses on returned data (`post.featuredImageUrl`,
      `product.variants[0].sku`, etc.). For each:
      - Check the corresponding admin-side schema file
        (`ConvexPress-Admin/packages/backend/convex/schema/<system>.ts`)
        to confirm the field exists.

4. **Compile a report.** For each file:
   - ✅ Clean (no drift)
   - ⚠️ Possibly stale (e.g., field accessed isn't in current schema —
     could be a renamed field or a removed one)
   - 🔴 Broken (query path doesn't exist — template will error at
     runtime)

5. **Recommend next steps per finding.** Don't fix yourself. For each
   issue, point to the right `design:*` skill to regenerate the affected
   file, and note any admin-side changes needed first (e.g., "add this
   public query to the admin backend before regenerating").

## Output contract

- **No file writes** to the Website repo. Reporting only.
- **Report format:**
  ```
  📋 Design Data Audit — 2026-05-11

  ✅ Clean: 6 templates
  ⚠️ Possibly stale: 2 templates
     - apps/web/src/routes/_marketing/products/$slug.tsx
       Accesses `product.variantPricing` but schema has `variantPrices`.
       → Run design:single-product after schema reconciliation.
  🔴 Broken: 1 template
     - apps/web/src/routes/_marketing/search.tsx
       Calls api.search.queries.search but admin no longer exports it.
       → Restore the query in admin, then run design:search.
  ```

## When NOT to use this skill

- Routine code review → that's not what this is. This is specifically
  schema drift across AI-generated templates.
- Bug fixes → fix the bug yourself or run the relevant `design:*` skill.
