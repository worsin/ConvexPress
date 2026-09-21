# HA2/HA3 appearance migration outcome — September 4, 2026

Implemented in `codex/convexpress-hardening`; no site data was changed.

- `settings/appearanceMigration.ts` projects legacy shop settings and the active theme palette into `appearance.template`. Existing surface choices, active-pack overrides, other packs/modules, and custom/dark palette tokens survive. Both authenticated Customize reads and the public projection use the same function before persistence.
- `settings/migrations.migrateLegacyAppearance` requires `manage_options` and persists the projection atomically with a document-level version/timestamp receipt (now v2, including header/footer). Repeating it performs no writes. First template settings updates and imports also set this receipt. Resetting values or switching packs afterward cannot resurrect the old palette/layout source. Partial first writes preserve the migrated pack settings; explicit empty settings/variants reset them.
- Added optional `settings.legacyAppearanceMigration` schema field. No new table/export is required. Legacy theme/layout records and schema remain intact for a future per-site migration and rollback inspection. Obsolete callable theme/layout modules have now been removed after verifying there are no consumers; their generated API references were removed. Only the migration reads source data directly.
- New storefront Shop reads follow the active pack's SDK settings and Customizer draft variants. Grid density is now a Shop module control. Product SSR prefetch reads template configuration and pack defaults. A small pure resolver retains supported legacy layout-preview URLs. Public `layoutConfig` and `colorPalette` are compatibility projections derived from effective template settings.
- Retired the duplicate Shop layouts editor to an Appearance Customize redirect, removed its navigation entry and unused preset illustration component. The saved URL remains usable.

Verification:

- The initial three actual-handler projection regressions failed before implementation, then passed.
- Settings suite: 13 pass, 0 fail, including seven new migration handler tests: anonymous denial, projection preservation, public parity, receipt persistence, repeated no-write behavior, partial first update, reset cutoff and import cutoff. `appearance-tests.log` holds output.
- Website Shop resolver: 3 pass, 0 fail.
- Backend, Admin web and Website web TypeScript checks pass; logs are `commerce-backend-typecheck.log`, `appearance-admin-typecheck.log`, `appearance-website-typecheck.log`.
- Template catalog check passes: 3 packs / 86 surfaces.

Remaining rollout acceptance belongs to the root task: deploy additive schema/code, invoke the migration for each site, confirm receipt and rendered palette/shop parity, rerun to prove no writes, then decide when legacy source schema/rows and compatibility APIs can be removed. No browser, deployment, provider call, commit or push occurred here.

HB4 extension: migration v2 copies nested Header/Footer builder overrides into the active pack, recursively preserving explicit pack fields, nulls and arrays. Former flat Customizer aliases are normalized to nested fields and removed so the new controls can edit them. Upgrading an existing v1 receipt never reopens the palette/shop fallback. Added v1-upgrade and alias-normalization handler regressions pass.
