---
name: design-header
description: Use when the user asks to design, redesign, build, regenerate, or restyle the site header / top navigation / site chrome at the top of pages. Triggers on "design the header", "rebuild the nav", "redo the top bar", "fix the site header". Styles the existing settings-driven header renderer at apps/web/src/components/layout/SiteHeader.tsx (or wherever the marketing layout mounts the header) without bypassing admin-selected header elements.
---

# design-header

You are styling the **site header** — the chrome at the top of every
marketing page. The header is a settings/theme-driven system, not a one-off
hardcoded React layer. Output stays in the `SiteHeader` renderer used by the
marketing layout route, but the visible elements must come from admin settings,
menus, site identity, auth, search, and commerce state.

## Hard Contract

- Preserve the admin-selected header model. The backend/admin chooses whether
  top bar, announcement/contact/social content, logo/title/tagline, navigation,
  search, CTA, user menu, dark mode toggle, mobile menu, and commerce/cart
  elements are enabled.
- Website code owns visual treatment: spacing, typography, responsive layout,
  token usage, hover/focus states, and graceful fallbacks.
- Do not hardcode a site's header content, links, phone/email, CTA, logo, menu
  items, or auth/cart visibility in the component when a settings/menu/data path
  exists.
- If a desired header element is not represented in `HeaderConfig`, the admin
  settings schema/defaults/editor must be extended first. Do not fake it in the
  public renderer.
- Keep `useHeaderConfig`, `useSiteIdentity`, `useMenuForLocation`,
  `HeaderActions`, and the marketing layout contract intact unless you are
  intentionally fixing that system.
- Header styling should use theme CSS variables and design-kit utilities. Avoid
  site-specific color literals or branded text in reusable platform code.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/header.example.tsx`.

2. **Pull brand + supporting data and the active public config:**
   ```bash
   bunx convex run settings/queries:getPublic '{}'
   bunx convex run menus/queries:getMenuForLocation '{"location":"header"}'
   ```

3. **Inspect the marketing layout** at
   `apps/web/src/routes/_marketing.tsx` to confirm where the header is
   mounted. The header component lives at
   `apps/web/src/components/layout/SiteHeader.tsx` (create the folder if
   missing). The layout file imports it as `<SiteHeader />`.

4. **Inspect the settings hooks and types** before editing:
   - `apps/web/src/hooks/layout/useHeaderConfig.ts`
   - `apps/web/src/hooks/layout/useSiteIdentity.ts`
   - `apps/web/src/hooks/layout/useMenuForLocation.ts`
   - `apps/web/src/lib/layout/types.ts`
   - Admin settings/defaults/editor files when adding new configurable fields.

5. **Style or refactor** `apps/web/src/components/layout/SiteHeader.tsx`
   around the existing config-driven shape:
   - Respect `headerConfig.layout` for style, sticky mode, background, height,
     and border.
   - Respect `headerConfig.topBar` for announcement/contact/social placement.
   - Respect `headerConfig.logo`, `navigation`, `search`, `cta`, `userMenu`,
     `darkModeToggle`, and `mobileMenu`.
   - Render menu items from the menu system only; never inline a site nav list.
   - Render cart/auth/search only through the existing data/config paths.
   - Keep mobile behavior responsive at 360px.

6. **Update the marketing layout** only if needed to mount the same configurable
   header renderer. Do not create a parallel custom header for a single site.

7. **Verify it compiles**, browser-smoke desktop and mobile, and record which
   config fields drive the visible elements.

## Output contract

- **File:** `apps/web/src/components/layout/SiteHeader.tsx`
- **Required exports:** `SiteHeader` (named export)
- **Must preserve:** the header settings contract and admin-selected element
  visibility.
- **Must include when enabled by config/data:** logo + brand, menu navigation,
  search affordance, cart link/count, Clerk auth UI, mobile drawer trigger,
  sticky positioning, responsive layout that works at 360px.
- **Must not include:** site-specific hardcoded header copy, links, menus,
  contact info, CTA, logo, or feature visibility that bypasses settings.

## When NOT to use this skill

- Footer → `design:footer`
- A blog header within a single post → that's part of `design:single-post`
