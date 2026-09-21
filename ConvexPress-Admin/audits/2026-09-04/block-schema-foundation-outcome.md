# Block schema foundation — September 5 checkpoint

Implemented the bounded Phase 1 foundation from the accepted block handoff, without touching runtime registries, rendering, registered Convex modules, generated Convex API bindings, or saved content.

## Delivered

- Root `blocks/events/upcoming/block.json` preserves the existing exact name, version 1, five attrs and defaults. Its local contract test compares both current app schemas. Resolver metadata is staged; live Events behavior is unchanged.
- `scripts/blocks/schema.mjs` defines closed block/field schemas, all sixteen field types, strict nested attrs, typed defaults, example validation, bounded work/depth, preview bindings and declared resolver-attribute bindings. Nested defaults parse through children. Author text is JSON encoded by the emitter; no author code is executed.
- Discovery uses root Library, plugin/extension and pack folder conventions. Names must match ownership, duplicate definitions and symlinks fail, and no final inventory is encoded in a registry.
- Deterministic staged output includes Zod/TS, Convex shape validators plus semantic parsing, catalog, editor/inserter descriptors, promotion dependency paths, and BlockDemo/coverage input. Generation uses atomic per-file writes and a final hash manifest; check mode detects field drift, missing/edited/stale outputs.
- Root `sync:blocks`, `check:blocks`, and `test:blocks` entrypoints. Existing app/backend drift checks remain part of the root check. No second workspace dependency installation was introduced.
- Optional live tracker mode reads only the exact Standalone base/table, verifies metadata and complete bounded pagination, and reconciles names/paths and Verified evidence. Offline snapshot mode is explicitly labeled. The supplied complete 136-row snapshot passed; live mode was tested with faithful paginated fixtures, not live calls.

## Verification

`bun run test:blocks`: **26 passed, 232 assertions**, including existing block tests, all new field/generator/tracker tests, actual generated Convex schema inserts, generated TypeScript compilation, and the representative block's compatibility test.

`bun run check:blocks --tracker-file ConvexPress-Admin/output/blocks-tracker/inventory-verified-2026-09-05.json`: passed. One spec, four discovered packs, 136 tracked inventory rows. Existing checks also passed: 38 core + 15 official discovered catalog blocks and 38 core + 16 discovered schema contracts.

Scoped `git diff --check`: passed. No provider/database/deployment/browser operations were performed. CLI help and sanitized local tracker output were inspected to implement faithful live pagination.

## Activation contract and remaining work

`blocks/README.md` documents exact generated exports and storage shapes. Promotion should consume pure `dependencyDescriptors` from `blocks/.generated/metadata.ts` or `dependencies.json`; repeater paths contain `*`, structured media IDs use `valuePath: ["id"]`, direct reference/menu/form IDs use `[]`. Data resolver metadata and child support travel with each descriptor. Missing names must remain closed until the remaining inventory is migrated.

The foundation is staged. Activation still requires migration of the remaining specs, generated shared runtime imports in both apps/backend, shape **and** semantic validation at writes, generic editor mounting, lazy registration, resolver execution, renderer/primitive integration, BlockDemo, and full screenshot coverage. The compiler's prose-only richtext schema is not permission to discard structural TipTap content during migration. Current `.generated/coverage.json` records missing renderers and unverified treatments honestly. Phase 1 and the full block program remain in progress.
