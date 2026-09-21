---
name: block-add-feature
description: Extend an existing ConvexPress canonical block while preserving saved content, generated contracts and template behavior.
---

Find the repository root, read `block-kit/CONTRACT.md`, `WORKFLOW.md` and `DATA-API.md`, then locate the block through `scripts/blocks/discovery.mjs` or `blocks/.generated/catalog.json`. Read its root spec, renderer, affected data/host contracts and existing examples/tests.

Determine how saved values and every supported version behave before changing fields or semantics. Add meaningful regression coverage for existing content and the requested behavior. Version changes require a wired canonical converter with preservation/recovery tests; an adjacent `migrations.ts` or automatic version increment is insufficient. Inspect `scripts/blocks/content-migration.mjs`, `staged-migration.mjs` and the canonical document migration service for the applicable path.

Edit the root contract and renderer, then run the canonical sync and relevant checks in WORKFLOW.md. Generated controls should expose the new content fields; add specialized editor support only when required. Keep presentation in SDK/template treatments. Do not copy schemas into app registries or bypass revision, data-grant, site or publication checks.

Report compatibility, actual migration evidence, rendered/editor acceptance and remaining gaps. Do not mark a field migration complete based solely on validation of freshly created instances.
