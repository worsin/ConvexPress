# Staged canonical block rendering

This Library renderer serves the canonical Website document view and the internal BlockDemo. Callers supply verified document/data/media installation and manage viewer leases. The renderer does not read backend records, authorize viewers, execute server resolvers, migrate records or fall back to the legacy registry.

Definitions live alongside their canonical spec at root `blocks/<namespace>/<name>/render.tsx`. `defineBlock` binds a typed view to generated `AttrsByName`; generated Zod validation remains authoritative. Vite convention discovery builds the dispatch map; no handwritten block registry or second attribute schema exists. Runtime discovery checks path/name ownership and duplicates. The generated coverage artifact discovers these files on the next `sync:blocks`.

## Template-owned renderers

A template declares an override in `template.json` under `blocks.renderers`, for example `"core/hero": "./blocks/core/hero.tsx"`. That exact pack-owned module exports a `defineBlock` or `defineDataBlock` definition with the same canonical identity, resolver and flow as the Library. The manifest and module must agree; missing, ambiguous, foreign and undeclared modules fail discovery. Root tooling checks canonical names and regular file ownership; runtime installation additionally checks the exported definition.

`PrimitiveProvider` supplies the active pack identity. `installPackRenderers` uses that pack's declared view, or the Library view when there is no override. It never inherits another template's renderer. Selection changes presentation without rewriting the saved block tree or changing policy, media validation, resolver grants or viewer authorization. Own CSS must be scoped to the pack. Product Showcase and Category Tiles share SDK behavior with their canonical Library entries so template styling preserves pricing, stock, cart-host behavior and unavailable states.

`owned-treatments.pw.ts` verifies actual override selection and unchanged canonical content across Journal, Depot and Core. `owned-interactions.pw.ts` checks category empty/restore, product pricing/destinations and keyboard FAQ interaction. Form preview steps have separate coverage. These fixture checks do not prove saved-site template switching or live cart/form submission.

## Named styles and hidden blocks

Declare finite style names per block in the same manifest:

```json
{
  "blocks": {
    "renderers": { "core/cta-band": "./blocks/core/cta-band.tsx" },
    "styles": { "core/cta-band": ["default", "inset"] },
    "hidden": ["core/bento-grid"]
  }
}
```

Names use lowercase letters, digits and hyphens, start with a letter, and are at most 64 characters. Each list contains at most 16 distinct names. Discovery rejects unknown block names, styles on blocks without `supports.styles`, and named styles without an owned renderer. `default` is implicit. Run `node scripts/blocks/sync-all.mjs` from the repository root to distribute the manifest vocabulary to the editor, AI and Website.

The typed renderer receives the effective `style` beside `attrs`. Map each declared name to scoped CSS or a deliberate JSX variant; never use a saved style as an arbitrary class name. Journal's CTA `inset` and Depot's CTA `outline` are working examples. Style selection changes the canonical instance's `style`, leaving content attributes intact.

A saved name unsupported by the active pack renders as `default`. The editor explains the fallback and keeps the original name until the author selects another style. Switching packs never rewrites the document. AI may generate only the active pack's per-block style choices, even though the storage contract preserves unsupported saved names for later template changes.

`hidden` removes blocks from new editor insertion, starter patterns and AI choices; it is not an authorization rule and does not remove existing content. A distributed starter pattern cannot contain a hidden block, including nested children. Existing hidden content remains editable and rendered under normal authorization. AI currently refuses to generate from documents containing unavailable or hidden blocks rather than silently omitting their content.

## Rendering boundary

`prepareBlocks(unknownTree, registry, policy, publicResources)` validates before producing elements:

- Canonical name and exact version, site-disabled blocks, owning/required plugins and declared capabilities.
- Generated closed attributes/defaults/refinements, supported semantic layout, anchors, unique IDs, and child support.
- Maximum512KiB input,80nodes and8levels. This is a bounded staged render budget, not production-scale orchestration.
- Only public media dependencies declared by generated metadata enter a renderer. Their closed DTOs are validated and copied into a frozen per-block map. Unresolved media or any other unimplemented reference adapter fails explicitly.
- Resolver-backed blocks without an installed data adapter, malformed style values, unknown instance fields including visibility/locks, absent renderers and unmet runtime requirements fail with stable `BlockRenderError.code` and an actionable detail. There is no silent legacy fallback.

`policy` is trusted caller configuration, not authorization. Production callers obtain it from the authorized server query and retain enabled-plugin/disabled-block enforcement there. The supplied runtime capability strings cannot activate missing adapters: data resolvers and references still fail without their explicit integration.

All 137 canonical specs have renderer files. File presence is distinct from runtime activation and full editor/public acceptance. Synced Content remains disabled by server policy pending its authoring and contact/media lifecycle integration. The current filesystem and generated coverage are the inventory authority.

For reusable content, pass `{ source: syncedDisplay, scope }` as the seventh `prepareBlocks` argument. The host reconstructs the bounded, redacted occurrence graph from this closed display contract, checks wrapper policy, and uses the expanded resolver tree for the existing data grant. Rendered wrappers retain their layout and anchors; their children receive stable placement IDs. Saved references are never rewritten. Missing, altered, foreign or hidden-only bodies are rejected. A missing published source displays an unavailable state; a fully restricted body stays empty. Neither this display contract nor an omission list grants backend access.

Structured prose uses the generated canonical rich-text schema and SDK `RichText`, preserving underline, hardBreak, mark nesting and safe link targets. Inline mode prevents nested paragraphs in headings/list entries. Unsupported structural article nodes still fail; no stringification or mark stripping is used. Existing plain-copy section fields retain their documented small inline-markdown adapter. A CTA label without a destination remains plain text; a destination without an accessible label fails.

Media comes from supplied public views. Source record IDs are never treated as URLs. Structured focal points map only bounded numeric coordinates to object-position; composition props still expose no arbitrary CSS or DOM fields.

## Verification

From Website/apps/web:

```sh
bun test ./src/templates/sdk/primitives ./src/templates/sdk/block-renderer/model.test.ts ./block-demo/gallery.test.tsx
bun x tsc --noEmit -p tsconfig.block-demo.json
bun run check-types
bun x vite build --config vite.block-demo.config.ts
```

`tsconfig.block-demo.json` typechecks the canonical root renderer modules plus the isolated UI with the existing pinned React/Zod declarations. Main Website typechecking also checks statically imported SDK and template modules. Keep type-only React path aliases in the isolated typecheck configuration: Vite reads the main tsconfig and would otherwise attempt to bundle declaration files. Runtime Vite/Bun aliases resolve the same installed packages, not declaration files; no root dependency installation or second lockfile is introduced.

The isolated test runner discovers Library renderers and manifest-declared pack overrides, bundles them against the existing workspace runtime, runs actual SSR against every normalized canonical example, verifies owned-renderer markers and removes its temporary files. Its generated import list is a temporary test artifact, never a shipped registry. It also covers unknown/version/attribute/style/visibility/disabled/capability/child/media/ownership failures and per-block public media isolation.

Parent-only browser matrix command and evidence boundaries are in `block-demo/README.md`. Static rendering does not by itself establish visual acceptance, accessibility of every new view, legacy parity or tracker Verified status.
