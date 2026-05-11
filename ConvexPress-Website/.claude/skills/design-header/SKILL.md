---
name: design-header
description: Use when the user asks to design, redesign, build, regenerate, or restyle the site header / top navigation / site chrome at the top of pages. Triggers on "design the header", "rebuild the nav", "redo the top bar", "fix the site header". Generates apps/web/src/components/layout/SiteHeader.tsx (or wherever the marketing layout mounts the header).
---

# design-header

You are generating the **site header** — the chrome at the top of every
marketing page. Output: a `SiteHeader` component that's used by the
marketing layout route.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/header.example.tsx`.

2. **Pull brand + supporting data:**
   ```bash
   bunx convex run settings:queries:getBySection '{"section":"brand"}'
   bunx convex run settings:queries:getBySection '{"section":"general"}'
   bunx convex run menus:queries:getMenuForLocation '{"location":"primary"}'
   ```

3. **Inspect the marketing layout** at
   `apps/web/src/routes/_marketing.tsx` to confirm where the header is
   mounted. The header component lives at
   `apps/web/src/components/layout/SiteHeader.tsx` (create the folder if
   missing). The layout file imports it as `<SiteHeader />`.

4. **Generate** `apps/web/src/components/layout/SiteHeader.tsx`
   following the reference's shape:
   - Sticky top, backdrop blur
   - Logo + brand name (from `getSiteIdentity`)
   - Primary nav from `getByLocation({ location: "primary" })`
   - Search affordance (link to `/search` or inline input if brand permits)
   - Cart icon with live count (commerce hook)
   - Clerk sign-in / `<UserButton>` on the right
   - Mobile drawer via Base UI Dialog
   - Hard-rule respect (e.g., "phone number visible in header")

5. **Update the marketing layout** if needed to import the new component.

6. **Verify it compiles** and **record generation** (CONTRACTS §8).

## Output contract

- **File:** `apps/web/src/components/layout/SiteHeader.tsx`
- **Required exports:** `SiteHeader` (named export)
- **Must include:** logo + brand, primary nav from menus, search affordance,
  cart link, Clerk auth UI, mobile drawer trigger, sticky positioning,
  responsive layout that works at 360px.

## When NOT to use this skill

- Footer → `design:footer`
- A blog header within a single post → that's part of `design:single-post`
