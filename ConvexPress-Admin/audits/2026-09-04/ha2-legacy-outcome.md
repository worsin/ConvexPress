# HA2 — legacy appearance cleanup

Implemented in the isolated hardening worktree; no deployment, provider writes, browser operations, commits or pushes.

## Changes

- Moved the eight still-used Core page/error implementations into `templates/packs/core/parts`. Removed dead root template wrappers, all legacy `template-parts`, both registries, the unused theme context and active-layout hook. Website source has no remaining legacy theme/layout API consumers.
- Retired Admin Themes, Colors and Layout editors; saved routes redirect to Templates/Customize. Removed the unused theme/layout composer components and legacy page layout selector while preserving header/footer visibility switches.
- Changed all internal catalog links to `/products`, removed the obsolete `/shop` redirect and regenerated the route tree (31 removed lines).
- Palette rendering now shares one pure helper between brand and template CSS. Migrated custom tokens, `dark-` overrides and intrinsically dark palettes retain their original semantics. A reproduced functional-color style-element escape is rejected by the color validator.
- Coordinated migration with HA3: `settings/appearanceMigration.ts` projects the active legacy palette into active-pack colors, respects explicit overrides, and persists an independent receipt so resets do not resurrect legacy choices. Legacy source tables are retained until each site has a migration receipt; destructive schema retirement requires fleet migration acceptance first.
- Removed seven redundant spread-fallback lint warnings in existing Website settings hooks.

## Verification

- Website source suite: **466 pass, 0 fail, 1,118 assertions** across 26 files (includes HA3's concurrent shop tests).
- Palette regressions: custom tokens, dark palette, unsafe names/values and functional-color style escape; the escape test failed before the fix.
- Appearance migration actual-handler suite: **7 pass**, including projection parity, explicit-value preservation, anonymous rejection, idempotence, reset and import cutoff.
- Content + feed + membership + appearance suites: **179 pass, 0 fail, 655 assertions** across six files.
- Website lint and TypeScript: **pass**. Site backend TypeScript (`-p convex/tsconfig.json`): **pass**. Admin TypeScript: **pass** at HA2 handoff checkpoint; targeted Admin navigation/dashboard settings tests: **11 pass**.
- Template catalog check: **3 packs / 86 surfaces pass**. Import scan finds no deleted Website module references. `git diff --check`: **pass**.

## Acceptance remaining for the root agent

Verify the palette and Customize rendering in each fleet site, migrate each site's legacy appearance with the authorized mutation, and retain migration receipts before removing source tables. Confirm saved Admin legacy URLs redirect and the active template retains its page/error layouts. `/shop` has intentionally been retired; internal links target `/products`.
