# Existing block specification migration — staged checkpoint

All **54 current definitions** (38 core +16 portable/local) now have canonical `blocks/<namespace>/<name>/block.json` specifications. **44 declare explicit v1-to-v2 migrations; 10 retain v1.** No runtime registry, renderer, registered Convex module, generated API, or stored content was changed.

## Contracts and migration behavior

The generator now supports explicit scalar repeaters, numeric select values, flat media IDs, safe href strings, ID/slug references, and migration descriptors within the same closed field vocabulary. Unknown refinements still fail. Source types, bounds, order and unset sentinels are preserved where representable. Known legacy URL refinements become strict safe protocols under a new version; arbitrary schemes are never retained as valid links. Invalid empty copy defaults become nullable absence while real text retains minimum-length validation.

The tool-only `scripts/blocks/staged-migration.mjs` prepares an individual same-environment conversion without writing data. It materializes actual old Website defaults, applies declared transformations, validates before lookup hooks, and returns the new block together with the complete original revision and exact old render attribute projection. Every result remains `requires-render-acceptance`. Unsafe URLs, oversize values, unknown attributes, wrong versions, cross-environment changes and nested legacy trees refuse rather than truncate or discard content.

Thirteen blocks separate legacy design values into verified pack treatments: divider, spacer, media-text, hero-text-only, hero-split, bento-grid, newsletter-signup, category-tiles, field-guide, product-collection, product-showcase, story-timeline and tabbed-content (exact namespace/name paths are in the report). The resolver must confirm the exact original properties, active pack and target environment before supplying a named style. Existing values are retained in the revision/render projection. Semantic alert variants and table-header columns remain content.

Root explicitly approved adding `tag` and `user` reference targets to avoid hiding real dependencies as text. Nonempty tags require resolution within the intended target tags taxonomy and storage form. Nonempty users require a reviewed mapping from the exact source user to a target author; customer, guessed/email, unreviewed and wrong-target mappings refuse. Empty IDs remain unset. This helper does not copy customer records and is not a promotion API.

## Website defaults and activation

The Website intentionally uses looser core render schemas: 36 of38 differ from current save schemas, and7 have different missing-attribute defaults (heading, list, comparison-table, contact-form, newsletter-signup, cta-with-form, booking-cta). The staged path captures `WebsiteSchema.parse(original.attrs)` before changes instead of substituting editor defaults. Empty old heading/required copy and comparison columns can become explicit null without adding visible text; old render attrs remain available until the replacement renderer is verified.

This preserves a concrete rollback/render bridge, not a claim that current Website renderers already consume v2. Actual stored-data preflight, atomic revision persistence, compatibility rendering and per-pack screenshot acceptance remain root-owned activation work. Values outside the new safe contract require review; no migration is applied silently.

## Tracker evidence

`blocks/.migration/existing-contracts.json` contains every current name, tracker row ID, source hash, source/render differences, complete field metadata, version, migration descriptors and emission state. `blocks/.generated/migrations.json` is the generated transformation input. Root owns all tracker writes. All54 existing names were already in the136-row Standalone inventory. No new inventory name was introduced; remaining planned specs and renderers are separate work. Local sample alert uses canonical category `site` instead of old `custom`; attrs stay unchanged. Field Guide is now a staged v2 spec, never a mutation of Aster's saved v1 attrs.

## Verification

- Root `bun run test:blocks`: **34 passed /1,874 assertions**, including every current definition, unchanged v1 differential tests, staged defaults/render projections, safe URL rejection, exact treatment binding, wrong-target/taxonomy/customer mapping refusal, generated TypeScript compilation, actual Convex shape tests, and previous block regressions.
- Root `bun run check:blocks --tracker-file ConvexPress-Admin/output/blocks-tracker/inventory-verified-2026-09-05.json`: passed;54 specs,4 packs,136 tracker rows, prior runtime contract checks retained.
- `bun run check:blocks-migration`: intentionally refuses activation while44 renderer/treatment acceptances and36 Website schema reconciliations remain. No unresolved specification conversion is disguised as success.
- Scoped `git diff --check`: passed.
- No live calls, provider mutations, database writes, deployments or browser operations.

Phase1 remains in progress: planned inventory, generic editors, lazy loading and real runtime integration are incomplete. The SDK/renderer and complete screenshot matrix remain separate required work.
