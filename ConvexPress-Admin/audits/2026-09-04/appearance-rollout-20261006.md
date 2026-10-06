# Appearance migration rollout reconciliation

Task5/E08. The current delivery sites have already crossed the legacy appearance cutoff; no production migration repair or data rewrite is necessary.

## Live state

Authenticated reads on the four example staging sites (4880/4890/4900/4910) plus the original source4860 and target4870 verified exact instance identities. Every appearance.template row has legacyAppearanceMigration.version2. None has a separate commerce.layout, header or footer settings row. Receipt timestamps predate this batch.

Invoked the existing capability-checked settings/migrations:migrateLegacyAppearance once per site. All six returned migrated:false. Exact appearance rows (including IDs, values, update metadata and receipt), template snapshots and legacy-section reads remain unchanged. All six newly created API sessions were revoked and refresh returns401. No user session or process was changed.

Evidence: output/appearance-review-20261006/receipt-verification.json and six *-receipt-before.json files; four *-before.json files additionally capture authenticated/public appearance projections. No secrets are recorded in these receipts.

## First migration, precedence, reset and recovery

New scripts/sites/appearance-migration.test.ts bridges actual registered backend handlers to the Website palette CSS and Shop layout consumers under all four active packs. It proves explicit template variants/primary/cart choice beat old values; absent product layout/density, custom tokens and dark tokens migrate; unrelated pack settings and surface overrides survive; public consumer output is identical before/after persistence; a second invocation writes nothing; explicit reset cuts off legacy fallback; importing the saved migrated values recovers the previous rendered CSS/layout; source theme/layout rows and the receipt survive.

Four cases/68assertions pass. Existing migration handlers and Shop resolver:12cases/39assertions pass. These first-write and recovery scenarios are isolated handler/consumer tests, not a claim that newly created legacy rows were imported into live databases. Live first-write rollout is unnecessary for the six current delivery environments because their authoritative receipts already establish migration; the no-write cutoff was verified there directly.

## Retired UI and runtime authority

Source routes /appearance/themes → /appearance/templates; /appearance/colors, /appearance/header, /appearance/footer and /settings/shop-layout → /appearance/customize. The Appearance navigation exposes Templates, Customize, Menus and Menu Locations. The public settings query derives templateConfig, legacy compatibility layoutConfig and colorPalette from readAppearance; the current Website Shop hook/SSR path resolves template settings and variants, and ThemeStyleInjector ignores legacy palette when templateConfig is present. Legacy schema/source data remain for recovery rather than being destructively removed.

The E08 palette/shop migration and duplicate-editor retirement gate is accepted for these delivery environments. This does not close E09 Customizer field/dashboard/promotion acceptance, E05 hosted preview, Task7 SDK workflows or final candidate integration. Next: remaining Task5 Customizer surface matrix and hosted scope evidence, with independent Task7 work available if an external prerequisite remains.
