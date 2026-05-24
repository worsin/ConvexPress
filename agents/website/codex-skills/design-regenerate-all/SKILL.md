---
name: design-regenerate-all
description: Use when the user asks to redesign the entire site, regenerate all templates, refresh the whole design, rebuild the front end, or apply a brand change everywhere. Triggers on "redesign the whole site", "regenerate all templates", "refresh the design", "rebuild everything", "the brand changed, redo all the pages". Orchestrates every other design:* skill in the correct order.
---

# design-regenerate-all

You are orchestrating a **full-site regeneration**. You don't write any
templates yourself — you invoke each per-route `design:*` skill in the
correct order. Output: a series of regenerated files + one consolidated
report.

## When the user invokes this

They want the entire visible site rebuilt against the current brand
doc. Typical reasons:
- They just ran `design:brand-discovery` and want every page to reflect
  the new brand.
- A major brand pivot — the site looks dated and they want a fresh pass.

## Workflow

1. **Read** `design-kit/README.md`, `ARCHITECTURE.md`, `CONTRACTS.md`,
   `BRAND.md` once. (Per-route skills will read references when invoked.)

2. **Pull the brand doc:**
   ```bash
   bunx convex run settings:queries:getBySection '{"section":"brand"}'
   ```
   If `null`, STOP. Tell the user to run `design:brand-discovery` first.

3. **Confirm scope with the user.** Show them this list and ask which to
   regenerate. Default to "everything":

   - Site chrome:
     - `design:header`
     - `design:footer`
   - Content templates:
     - `design:homepage`
     - `design:single-post`
     - `design:single-page`
     - `design:archive` (blog index)
     - `design:archive` (category, tag, author — one each if confirmed)
   - Commerce templates (skip if site has no products):
     - `design:catalog`
     - `design:single-product`
   - Utility:
     - `design:search`
     - `design:not-found`

4. **Run the skills sequentially in this order:**

   1. `design:header` (chrome first — body templates may reference its height)
   2. `design:footer`
   3. `design:homepage`
   4. `design:single-post`
   5. `design:single-page`
   6. `design:archive` (each variant the user confirmed)
   7. `design:catalog`
   8. `design:single-product`
   9. `design:search`
   10. `design:not-found`

   For each skill: invoke it, wait for it to complete, capture its
   report, move on. If any skill errors, stop and surface the error
   before continuing.

5. **After all skills complete**, run a final compile check:
   ```bash
   cd ConvexPress-Website && bun --filter web check-types
   ```
   If errors appear, walk them back to the offending skill and re-run it.

6. **Write a consolidated generation report.** For each skill:
   - File(s) written
   - Key brand-driven decisions
   - Any data gaps surfaced
   - Any contract conflicts and resolutions
   Conclude with overall site-level observations (e.g., "two pages with
   stale data that should be authored before next regen").

## Output contract

- **Side effects:** every confirmed per-route skill runs and writes its
  file(s). One generation receipt per file (CONTRACTS §8).
- **Final report:** a single consolidated summary back to the user,
  ordered by skill.
- **Failure mode:** if any skill errors, STOP and report. Don't
  silently continue and leave the site in a mixed state.

## When NOT to use this skill

- Targeted edit ("just the homepage") → use the specific `design:*` skill.
- Brand setup → `design:brand-discovery` first.
- A single page that's broken → the relevant `design:*` skill alone.
