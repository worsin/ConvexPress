# Styling and composition entry points

Paths are relative to the repository root. Use the real native workbench for
authoring acceptance; public Website preview receives a bounded display document,
not an operator token or private database client.

## Library presentation

`ConvexPress-Website/apps/web/src/templates/packs/<pack>/template.json` declares
`blocks.renderers`, `blocks.styles` and `blocks.hidden`. Inspect Journal's
`blocks/core/cta-band.tsx` and `blocks/owned.css` for a current owned treatment.
`scripts/blocks/pack-presentation.mjs` validates named styles. The root block spec
owns whether styles are supported; a pack owns the available style names.
`scripts/blocks/pack-design.mjs` compiles the installed manifest and DESIGN.md into
the guide and revision used by AI. Author-supplied text cannot replace that guide.

Run from repository root after a source presentation change:

```sh
bun run sync:blocks:all
bun test ./scripts/blocks/pack-presentation.test.mjs ./scripts/blocks/pack-design.test.mjs ./scripts/blocks/composed-presentation.test.ts
bun run check:blocks
bun run sync:blocks:all --check
```

Then run the renderer and visual/editor checks in WORKFLOW.md. `blocks.hidden`
controls new authoring discovery; it is not permission to discard saved blocks.

## Template layout controls

The standard Layout module exposes `sectionSpacing`, `elementSpacing` and
`blockGap`, alongside `contentWidth` and `radius`. Packs set these defaults in
`template.json`; authors override the same fields in Customize. Website
`settingsModules.ts` calls the closed `blockLayoutCss` mapping; Admin exposes the
same field schema. No authored CSS lengths or class names are accepted.

- `sectionSpacing`: compact, comfortable or spacious; maps all three section padding intents.
- `elementSpacing`: compact, comfortable or spacious; maps small/medium/large stack gaps, grid gap and card padding.
- `blockGap`: none, small, medium or large; controls the gap between adjacent sections.
- `contentWidth`: narrow, wide or full; also sets the SDK contained/wide limits. Full is capped at110rem for legibility on very wide screens; explicit full-width blocks remain full width.

Depot defaults to compact spacing; Journal uses comfortable section spacing and
spacious content gaps. Core and Aster House use comfortable spacing. Per-block
spacing/width intents continue to select the matching template token. Secondary
hero and CTA actions use the SDK outline variant and wrap with the primary action.

Source checks and the four-pack desktop/mobile composed-page proof are in
`output/default-pack-review-20260920`. Native Core Customize now has draft/save/reload/publish/reset/Undo/Redo/conflict
acceptance on a disposable site in `output/customizer-layout-20260920`. Choosing
Template default removes the field override; older saved null sentinels also
inherit defaults. Explicit false, zero, empty strings and empty arrays remain
authored values. Default labels follow the selected pack. Current four-pack
layout, palette and Shop coverage is recorded in the repository reports
`ConvexPress-Admin/audits/2026-09-04/customizer-global-layout-20261006.md` and
`customizer-palette-shop-20261006.md`. The delivery plan maps accepted native
header/footer/menu and appearance-promotion evidence. Local on-site editing has
separate operator-identity acceptance; public HTTPS/local-network launch and the
final integrated block visual/motion gate remain open. Consult the current
delivery status instead of treating the older Core-only checkpoint as current.

## Runtime creation and styling

The native editor implementation is under
`ConvexPress-Admin/apps/web/src/components/blocks/custom-blocks/`. Authoritative
backend functions are under `ConvexPress-Admin/packages/backend/convex/`:

| Operation | Function and exact identity |
|---|---|
| AI composition proposal | `blockDefinitions/ai:compose`: name, packId, expectedScope, optional selected resources, prompt |
| Commit reviewed AI draft | `blockDefinitions/composeContext:createDraft`: same name/pack/scope/resources, expectedFingerprint, definitionJson |
| Manual draft creation | `blockDefinitions/drafts:create`: definitionJson |
| Read exact draft/version | `blockDefinitions/drafts:get`: id, optional version; returns generation and digest |
| AI pack styling proposal | `blockDefinitions/ai:styleForPack`: id, expectedGeneration, version, expectedDigest, packId, prompt |
| Append reviewed next version | `blockDefinitions/drafts:save`: id, expectedGeneration, definitionJson |
| Approve/revoke a saved version | `blockDefinitions/publication:setVersionState`: id, version, expectedGeneration, expectedDigest, enabled |

The backend enforces compose and action-specific content authority, current
installation, immutable versions and exact review identities. Do not manufacture
approval by writing tables. Preserve returned digests and fingerprints verbatim.
Draft save does not move the approval pointer or rewrite pinned pages.

Runtime `packTreatments` contain primitive compositions keyed by installed pack;
they are distinct from Library renderer files and finite `style` names. The shared
composition evaluator and attrs compiler are under Admin's
`packages/backend/canonical-blocks-foundation/`; synchronization supplies identical
portable code to Website and the deployable backend.

Local checks, from repository root:

```sh
bun test ./scripts/blocks/composition.test.ts ./scripts/blocks/composed-definitions.test.ts ./scripts/blocks/composed-registry.test.ts ./scripts/blocks/composed-presentation.test.ts
```

From `ConvexPress-Admin/packages/backend`:

```sh
bun test convex/blockDefinitions/__tests__/compose.test.ts convex/blockDefinitions/__tests__/style.test.ts convex/blockDefinitions/__tests__/drafts.test.ts convex/blockDefinitions/__tests__/publication.test.ts
```

These tests prove local contracts, not provider or live rendering acceptance.
Current runtime composition restrictions and examples are in composition-runtime.md.
