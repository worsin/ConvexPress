---
name: design-footer
description: Use when the user asks to design, redesign, build, regenerate, or restyle the site footer / bottom navigation / copyright row. Triggers on "design the footer", "rebuild the footer", "redo the footer columns", "fix the site footer". Generates apps/web/src/components/layout/SiteFooter.tsx.
---

# design-footer

You are generating the **site footer**. Output: a `SiteFooter` component
mounted by the marketing layout route.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/footer.example.tsx`.

2. **Pull brand + supporting data:**
   ```bash
   bunx convex run settings:getBrand
   bunx convex run settings:getSiteIdentity
   bunx convex run menus:queries:getByLocation '{"location":"footer-primary"}'
   bunx convex run menus:queries:getByLocation '{"location":"footer-secondary"}'
   bunx convex run menus:queries:getByLocation '{"location":"footer-tertiary"}'
   ```

3. **Inspect the marketing layout** at
   `apps/web/src/routes/_marketing.tsx`. Footer mounts there as
   `<SiteFooter />` from `apps/web/src/components/layout/SiteFooter.tsx`.

4. **Generate** `apps/web/src/components/layout/SiteFooter.tsx`:
   - Brand block (logo, tagline, optional newsletter signup)
   - 2-3 link columns sourced from footer menu locations
   - Legal row at the bottom (copyright + privacy/terms)
   - Social icons row (read from `getSiteIdentity().socials` if present)
   - Use `bg-card` / `text-card-foreground` so the footer reads as
     "chrome" distinct from page body

5. **Verify it compiles** and **record generation** (CONTRACTS §8).

## Output contract

- **File:** `apps/web/src/components/layout/SiteFooter.tsx`
- **Required exports:** `SiteFooter` (named export)
- **Must include:** brand block, link columns from menus system,
  copyright + legal links, responsive grid that works at 360px.

## When NOT to use this skill

- Header → `design:header`
