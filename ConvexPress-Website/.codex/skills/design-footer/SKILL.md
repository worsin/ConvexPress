---
name: design-footer
description: Use when the user asks to design, redesign, build, regenerate, or restyle the site footer / bottom navigation / copyright row. Triggers on "design the footer", "rebuild the footer", "redo the footer columns", "fix the site footer". Styles the existing settings-driven footer renderer at apps/web/src/components/layout/SiteFooter.tsx without bypassing admin-selected footer rows, cells, menus, or section toggles.
---

# design-footer

You are styling the **site footer** mounted by the marketing layout route. The
footer is a settings/theme-driven system, not a one-off hardcoded React layer.
Admin selects the rows, cells, legacy section toggles, menus, contact details,
newsletter, branding, and legal/copyright behavior. Website code makes that
configuration render beautifully.

## Hard Contract

- Preserve the admin-selected footer model. Render `FooterConfig.rows` through
  the rows/cells renderer when present; otherwise render the legacy section
  toggles from `FooterConfig`.
- Website code owns visual treatment: row bands, spacing, typography,
  responsive grid behavior, token usage, hover/focus states, and fallbacks.
- Do not hardcode a site's footer links, contact details, columns, newsletter
  text, copyright line, logo, or social links in reusable component code when a
  settings/menu/data path exists.
- If a desired footer cell or option is not represented in `FooterConfig`, add
  it to the admin settings/schema/builder first. Do not fake it in the public
  renderer.
- Keep `useFooterConfig`, `useSiteIdentity`, `useMenuForLocation`,
  `FooterRowsRenderer`, and the marketing layout contract intact unless you are
  intentionally fixing that system.
- Footer styling should use theme CSS variables and design-kit utilities. Avoid
  site-specific color literals or branded text in reusable platform code.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/footer.example.tsx`.

2. **Pull brand + supporting data and the active public config:**
   ```bash
   bunx convex run settings/queries:getPublic '{}'
   bunx convex run menus/queries:getMenuForLocation '{"location":"footer-1"}'
   bunx convex run menus/queries:getMenuForLocation '{"location":"footer-2"}'
   ```

3. **Inspect the marketing layout** at
   `apps/web/src/routes/_marketing.tsx`. Footer mounts there as
   `<SiteFooter />` from `apps/web/src/components/layout/SiteFooter.tsx`.

4. **Inspect the settings hooks and types** before editing:
   - `apps/web/src/hooks/layout/useFooterConfig.ts`
   - `apps/web/src/hooks/layout/useSiteIdentity.ts`
   - `apps/web/src/hooks/layout/useMenuForLocation.ts`
   - `apps/web/src/lib/layout/types.ts`
   - `apps/web/src/components/layout/FooterRowsRenderer.tsx`
   - Admin settings/defaults/editor files when adding new configurable fields.

5. **Style or refactor** `apps/web/src/components/layout/SiteFooter.tsx` and
   `FooterRowsRenderer.tsx` around the existing config-driven shape:
   - Respect `footerConfig.rows` as the v2 builder source of truth.
   - Respect `footerConfig.layout`, `branding`, `navColumns`, `newsletter`,
     `contactInfo`, and `bottomBar` in the legacy fallback path.
   - Render menu items from menu locations only; never inline a site footer nav
     list in reusable component code.
   - Render contact/newsletter/social/legal only through existing data/config
     paths.
   - Keep the footer readable and responsive at 360px.

6. **Verify it compiles**, browser-smoke desktop and mobile, and record which
   config fields drive the visible elements.

## Output contract

- **File:** `apps/web/src/components/layout/SiteFooter.tsx`
- **Required exports:** `SiteFooter` (named export)
- **Must preserve:** the footer settings/rows contract and admin-selected
  element visibility.
- **Must include when enabled by config/data:** brand block, link/nav columns
  from menus system, newsletter, contact, social, copyright/legal rows, and a
  responsive grid that works at 360px.
- **Must not include:** site-specific hardcoded footer copy, links, menus,
  contact info, newsletter text, copyright, or layout choices that bypass
  settings.

## When NOT to use this skill

- Header → `design:header`
