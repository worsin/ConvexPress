# Handoff to Astra: block system re-foundation (2026-09-05)

From: Claude session. To: Astra. Owner: worsin. Status: approved direction, no code started by Claude.
Facts and evidence behind every claim here: `specs/research/BLOCK-SYSTEM-ANALYSIS-2026-09-05.md` (read §1 and §2 first; this handoff is the build spec, that file is the audit).

Owner's words, verbatim, that define the target:
- "Visible elements on the back in the editor that we can adjust the data for but controlled by the template on the front."
- "So blocks would just be a json file … front controlled by the template of course and AI creates the template for it when it needs to use a block."
- "The SDK would need default styling for all of the blocks so you can whip up a template fast with minimal tweaks."
- "We will take a chapter out of wordpress book and provide a small selection of templates that work with all of the blocks."
- "No amount of changes are too much for this feature. I am not married to any of it."

You are already working on parts of this. Reconcile: where your in-progress work matches a contract below, keep yours and note it in the progress table (§9); where it differs, the contracts here win unless you record a reason in §9 and the analysis doc.

---

## 1. The one principle

**A block is a data contract. The template owns rendering. AI may author both the data and, inside a safe vocabulary, the rendering.**

Everything below is a consequence. If a decision is not covered, resolve it by this principle.

## 2. Non-negotiable requirements

1. A block is defined once, as JSON. Zod, TypeScript types, Convex validators, the AI catalog, the default editor form, the inserter card and the coverage matrix are generated from it. Nobody hand-edits a registry.
2. The SDK ships a finished default treatment for every block. A new template made of `template.json`, `DESIGN.md` and token defaults renders the entire library looking finished.
3. Packs restyle blocks through three levers, in order of effort: tokens and Customize defaults; `parts` overrides of primitives; per-block styles or renderers for signature blocks only.
4. Block instances carry intents (wide, muted, spacious), never pixels, colours or class names. The admin never shows design controls.
5. AI sees every enabled block (core, portable, pack, plugin, composed), can nest, uses structured output, and can create a bespoke element at runtime as a composition over SDK primitives. Runtime AI never emits code, CSS or class names.
6. When a block is used under a pack with no treatment, AI writes the pack's treatment on demand from the block spec, the pack's `DESIGN.md` and its parts.
7. The server validates every saved block against the same generated spec. Unknown block names are rejected.
8. The admin editor previews the page through the real website in the real template, live, with click-to-select. It never re-implements rendering.
9. One content model: the block tree. Article mode and page sections migrate in and are removed.
10. Dynamic blocks get their data server-side through an allow-listed resolver registry, in the page query, so SSR works and a page costs one subscription.
11. Everything is a copyable, discoverable folder. Every layer has tests. Every block has a screenshot under every first-party pack.
12. A small first-party template collection (4 to 6 packs) each works with all blocks and ships patterns and a demo site.

## 3. Contracts

### 3.1 Block spec: `block.json`
Canonical location: `blocks/<namespace>/<name>/block.json` at the monorepo root (`blocks/core/feature-grid/`). Plugin blocks live in the plugin folder, pack blocks in the pack; all use the same file.

```json
{
  "name": "core/feature-grid",
  "title": "Feature grid",
  "description": "Three to eight short benefits, each with an icon.",
  "category": "marketing",
  "role": "content",
  "version": 2,
  "keywords": ["features", "benefits"],
  "ai": { "useFor": "3-6 short benefits with an icon each", "avoid": "long prose (use core/rich-text)" },
  "fields": [
    { "id": "eyebrow", "type": "text", "max": 40 },
    { "id": "title", "type": "text", "max": 120, "required": true },
    { "id": "body", "type": "richtext", "max": 600 },
    { "id": "items", "type": "repeater", "min": 2, "max": 8, "fields": [
      { "id": "icon", "type": "icon" },
      { "id": "title", "type": "text", "max": 60, "required": true },
      { "id": "body", "type": "text", "max": 200 },
      { "id": "link", "type": "link" }
    ] }
  ],
  "supports": { "children": false, "styles": true, "layout": ["width", "tone", "spacing", "align"], "anchor": true, "visibility": true },
  "data": null,
  "preview": "{title} · {items.length} items",
  "examples": [ { "title": "Why teams switch", "items": [ { "title": "Fast", "body": "Sub-second builds." }, { "title": "Safe", "body": "Typed end to end." } ] } ]
}
```

- `role`: `hero | opener | content | cta | aside | utility`. Replaces every hand-written `HERO_BLOCKS` set.
- `category`: `text | layout | media | openers | marketing | social | commerce | discovery | forms | plugin | site`.
- Field types (closed set, each with one editor control and one validator): `text, richtext, number, boolean, select, link, media, icon, color-role, date, repeater, reference, menu, form, object`. `reference` takes `{ "of": "product" | "post" | "page" | "category" | "course" | "event" }`. `color-role` values are token roles (`primary`, `accent`, `muted`), never hex.
- `data`: `null` or `{ "resolver": "commerce.productCards", "args": { "slugs": "attrs.slugs", "limit": 8 } }` (see 3.6).
- `examples` must validate against `fields`; the generator fails otherwise.

Generated by `bun run sync:blocks` (root script, same pattern as `sync-template-packs.mjs`): Zod + TS for both apps, Convex `attrs` validators per name, the AI catalog, default editors, inserter metadata, the coverage matrix input. CI fails on drift.

### 3.2 Block instance (stored on `posts.blocks`)
```ts
interface BlockInstance {
  id: string;                // blk_<random>
  name: string;              // spec name
  version: number;
  attrs: Record<string, unknown>;
  children?: BlockInstance[];               // only if supports.children
  layout?: { width?: "contained" | "wide" | "full"; tone?: "default" | "muted" | "inverted" | "accent"; spacing?: "none" | "compact" | "default" | "spacious"; align?: "start" | "center" };
  style?: string;            // named style offered by the active pack; falls back to "default"
  visibility?: VisibilityRule; // reuse the menu system's rule shape
  lock?: { move?: boolean; remove?: boolean; edit?: boolean };
  anchor?: string;
}
```
`contentMode`, `content` (TipTap) and `pageSections` are removed after migration (3.8). Rich text is `core/rich-text` holding a TipTap document; the TipTap renderer keeps inline marks only.

### 3.3 Primitive vocabulary (SDK, pack-overridable via `parts`)
`Section, Container, Stack, Grid, Columns, Split, Card, Heading, Eyebrow, Text, RichText, Image, Video, Icon, Button, Link, Badge, Divider, Stat, Quote, List, Accordion, Tabs, Marquee, Slot`.
- Each has a fixed prop set with closed enums (`gap: "sm"|"md"|"lg"`, `columns: {base, md, lg}`, `aspect`, `variant`, `level`, `tone`). Props map to tokens and the layout variables; no prop accepts a class name.
- Implemented once in `templates/sdk/primitives/`. A pack overrides one by exporting the same name from its `parts/` (Journal and Depot already have `parts/index.tsx`; the resolver prefers pack parts).
- Layout variables, fixed set of about ten, provided by the pack via `template.json` `defaults.layout` and the Customize layout module: `--block-gap`, `--section-py-compact|default|spacious`, `--section-max-contained|wide`, `--stack-gap-sm|md|lg`, `--grid-gap`, `--card-pad`.
- **Rule enforced by `check:blocks`**: a Library renderer uses primitives for all section-level structure; bare utilities only for a block's internals. A lint rejects `max-w-`, `py-`, `container`, `grid-cols-` at the top level of a renderer.

### 3.4 Library renderer
`blocks/<ns>/<name>/render.tsx`, `export default function Render({ attrs, data, layout, style, children, packId }: BlockRenderProps<Attrs>)`. Wraps itself in `<Section layout={layout}>`; uses primitives only; token classes only. Every block has one. It is the baseline every pack inherits, not a fallback.

### 3.5 Pack manifest: `blocks` section
```json
"blocks": {
  "renderers": { "core/hero": "./blocks/hero.tsx", "core/testimonials": "./blocks/testimonials.tsx" },
  "styles": { "core/testimonials": ["default", "editorial", "wall"], "core/cta-band": ["default", "inset"] },
  "defaults": { "core/section": { "layout": { "spacing": "spacious" } } },
  "hidden": ["core/bento-grid"],
  "patterns": "./patterns/*.json",
  "signature": ["journal/editorial-spread"]
}
```
Resolution per block: pack renderer → Library renderer (with pack `parts` and tokens applied). No pack inherits from another pack. Core is the SDK baseline with neutral tokens. Named styles are passed to the renderer as `style`; unknown style under another pack resolves to `default`.

### 3.6 Data resolvers
Backend `convex/blocks/resolvers/index.ts`: allow-list `{ "commerce.productCards": { args: v.object({...}), run(ctx, args) }, "commerce.categoryTiles", "content.posts", "content.related", "site.menu", "forms.form", ... }`. Plugins register resolvers in their manifest. The page query (`pages.getForRender` / post equivalent) walks the tree, runs each block's `data` resolver with `attrs`-bound args, and returns `data: Record<blockId, unknown>` alongside the blocks. The website loader passes `data[block.id]` to the renderer; the admin preview uses the same query. Renderers do not call `useQuery`.

### 3.7 Composed blocks (runtime AI elements)
Table `blockDefinitions`: `{ name: "composed/<slug>", spec: BlockSpec, composition: ElementTree, packTreatments?: Record<packId, ElementTree>, status: "draft"|"active"|"promoted", promotedTo?: string, createdBy, siteScope }`.

Element tree:
```json
{ "el": "Section", "props": { "tone": "muted", "width": "wide" }, "children": [
  { "el": "Heading", "props": { "level": 2 }, "bind": "attrs.title" },
  { "el": "Grid", "props": { "columns": { "base": 1, "md": 3 } }, "each": "attrs.items", "as": "item", "children": [
    { "el": "Card", "children": [
      { "el": "Image", "bind": { "media": "item.image" }, "props": { "aspect": "4/5" } },
      { "el": "Heading", "props": { "level": 3 }, "bind": "item.name" },
      { "el": "Text", "bind": "item.notes" },
      { "el": "Button", "props": { "variant": "secondary" }, "bind": { "label": "'Shop ' + item.name", "href": "item.href" } }
    ] }
  ] }
] }
```
- Constructs: `el`, `props`, `children`, `bind` (string or map), `each`/`as`, `if`. Expressions: paths (`attrs.x`, `item.y`, `data.z`), string literals, `+`, formatters `currency | date | plural | number`. Nothing else.
- Limits: depth ≤ 8, ≤ 300 nodes, `el` must be in 3.3, props validated against the primitive's enums. One validator, shared by client and server (generated).
- Runtime renderer `templates/sdk/composition/render.tsx` maps the tree to primitives (pack parts apply automatically).
- Actions: `blocks.compose` (prompt + enabled catalog + primitives + resolvers → spec + composition, validated, stored, inserted), `blocks.styleForPack` (block spec + pack DESIGN.md + parts → `packTreatments[packId]`, or writes `packs/<id>/blocks/<name>.tsx` in build mode), `blocks.promote` (composed → `blocks/<ns>/<name>/` folder with `render.tsx` scaffolded from the composition, tests, screenshots).

### 3.8 Content migration
Backend migration `blocks/migrations/2026-09-unify-content.ts`: for every post with `contentMode !== "blocks"`: convert `content` via the existing TipTap importer where lossless, else wrap in one `core/rich-text`; convert `pageSections` via `pageSectionsToBlocks`; set `blocks`; keep a `revisions` snapshot of the pre-migration document. Then drop `contentMode`, `content`, `pageSections` from the schema and delete the article renderer paths. Demo sites (Northstar, Ridgeline) must render identically before and after; screenshot both.

### 3.9 Editor preview channel
Reuse the Customizer channel (`convexpress:customize`, `?customize=preview`) with a new message `{ type: "convexpress:customize", packId, draft: { post: { id, blocks } } }`. The website's draft provider substitutes draft blocks for the post being previewed. Website stamps `data-block-id` on every block's `Section`; the preview iframe reports hover and click (`{ type: "convexpress:customize:select", blockId }`) back to the admin; the admin sends `{ type: "convexpress:customize:highlight", blockId }`. Device switch and page switch reuse the Customize screen's controls.

### 3.10 AI generation
Structured output (tool use with a JSON Schema generated from the enabled catalog, children allowed) replaces the code-fence prompt. The catalog sent includes core, portable, pack, plugin and composed blocks, minus disabled ones and hidden-by-pack ones, plus the pack's styles and patterns. Generation writes once (`replaceBlocks` or a streamed draft document the outline subscribes to), not one insert per block. Capabilities: `blocks.ai`, `blocks.compose`, `blocks.promote` added to RBAC.

## 4. Phases, in order, each shippable

| Phase | Build | Done when |
|---|---|---|
| **0 Truth and tests** | Snapshot-render every existing block under Core, Journal, Depot; tests for validation, migrations, TipTap import, AI extraction and policy; server rejects unknown names and checks disabled blocks on every mutation; delete dead fields (`rendererStatus`, `replacedBy`, `supports.reusable` etc.) or make them real; rewrite `block-kit` docs to describe reality | Block tests green in both repos and backend; `check:blocks` fails on a field drift, not only a name drift |
| **1 Schema-first** | `blocks/` root folder, `sync:blocks` generator, both registries generated (≤ 200 lines each), 38 core + 13 portable migrated to spec folders, generated validators and catalog, default editors from field types, AI sees every block, per-block lazy chunks | Adding a block = one folder + one command; AI inserts a portable block; no hand-written registry entries remain |
| **2 One content model** | Instance shape 3.2; nesting in the outline; `core/section`, `core/columns`, `core/group`, `core/rich-text`; layout intents, style, visibility, lock, anchor controls in row headers; content migration 3.8; block-tree autosave; `syncedBlocks` and `patterns` tables replacing `reusableBlocks` | No `contentMode` in the schema; one website renderer; demo sites identical before and after |
| **3 SDK baseline and template control** | Primitives 3.3 with parts overrides and the layout variables; every Library renderer rewritten to 3.4; lint in `check:blocks`; pack `blocks` manifest 3.5 and resolution; roles replace hero sets; Journal and Depot: parts overrides plus owned treatments for the flagship 12 blocks and 8 patterns each; screenshot matrix (blocks × packs) in `check:blocks` | A new pack with only `template.json`, `DESIGN.md` and token defaults renders every block finished; same page differs correctly across Core, Journal, Depot; switching packs never breaks a page |
| **4 Live editor** | Preview pane via 3.9 with click-to-select and highlight; inserter with per-pack thumbnails from the matrix, patterns and saved blocks tabs, "describe the element you need" box; undo/redo, multi-select, keyboard navigation; diagnostics screen (coverage per pack, invalid instances, usage) | An author never opens the site to see a change; screenshots of the editor under both packs |
| **5 Data and AI** | Resolver registry 3.6 and page-level data with SSR; reference pickers; structured-output generation 3.10 with nesting and single write; composed blocks 3.7 with `compose`, `styleForPack`, `promote`; capabilities | "Make a comparison of our three roasts with live prices" yields a working, template-styled, server-validated block with no deploy; SSR shows dynamic content; a block with no pack treatment gets one from `styleForPack` |
| **6 Library, collection, kits** | Grow to the ~120-block inventory (analysis §4) with tests and thumbnails; plugin blocks via plugin manifests; first-party collection of 4–6 packs (Journal, Depot, plus Studio, Ledger, Atlas, Bloom candidates) each with 100% coverage, patterns and a `site-build` demo site; `block-kit` rebuilt on the standard scaffold with skills `block-build, block-add-feature, block-audit, block-style, block-compose, block-promote, pattern-build, block-migrate-content`; roadmap entry | Coverage matrix full for every first-party pack; each kit skill produces a passing result from a one-line prompt |

Do not: add blocks to the current registries; add design controls to the admin; build a renderer inside the admin; let runtime AI emit class names, CSS or code; let a pack inherit from another pack; add layout variables beyond the fixed set.

## 5. Where things live today (so you can find and replace them)

- Admin: `apps/web/src/lib/blocks/{types,registry,schemas,validation,migrations,page-sections,tiptap-to-blocks}.ts(x)`, `components/blocks/{BlockOutline,BlockOutlinePanel,BlockLibraryButton,PageGenerationPrompt}.tsx`, `components/editor/EditorLayout.tsx` (mounts the outline), `blocks/*` and `blocks.local/*`, `packages/blocks-catalog/src/index.ts`, `scripts/admin/check-block-catalog.mjs` (`bun run check:blocks`).
- Website: `apps/web/src/lib/blocks/*`, `components/blocks/BlockListRenderer.tsx`, `components/blog/BlockContentRenderer.tsx` (article renderer, to be retired), `blocks/*`, pack surfaces `packs/{core,journal,depot}/surfaces/{page,blog.post}.tsx` (block list call sites), `templates/sdk/*`, `templates/packs/*/parts/`.
- Backend: `convex/blocks/{ai,aiPromptBuilder,helpers,migrations,mutations,queries,validators}.ts`, `schema/posts.ts` (blocks fields), `schema/editor.ts` (`reusableBlocks`, `editorLocks`), `schema/revisions.ts`, `settings` section `blocks`, AI routing in `convex/ai/internals.ts` (models in `settings/defaults.ts` `pageGenerationModel`, `blockEditingModel`).
- Kits: `block-kit/` (root), skills in `ConvexPress-Admin/.claude/skills/block-*` mirrored to `.codex/skills` and `agents/admin/codex-skills`; roadmap `plans/codex/KITS-ROADMAP.md` and `.codex/KITS-ROADMAP.md`.

## 6. Verification you must run and record

- `bun run check:blocks` (extended per phase), `bun test` in both repos and the backend, `bun run check-types` in both apps, `bun run check:templates` and `sync:templates` when the pack manifest changes.
- Screenshot matrix: every block under every first-party pack, stored under `ConvexPress-Admin/output/playwright/blocks/<pack>/<block>.png`; diff against the previous run.
- Fleet: deploy to alpha and gamma with `bunx convex deploy --url http://127.0.0.1:148x0 --admin-key … --yes`, then verify Northstar (Journal) and Ridgeline (Depot) through the Electron admin (`packages/desktop/scripts/dev.mjs`, standalone env is default) and the storefronts via View website. Owner rule: Electron for the admin, always.
- Evidence and notes: append a dated section to `specs/research/BLOCK-SYSTEM-ANALYSIS-2026-09-05.md` per phase, keep §9 below current, and keep the MagicTables Blocks table (§6a) current per block.

## 6a. MagicTables: the block tracker (source of truth for the inventory)

The block inventory lives in MagicTables, not in this file. Analysis §4 is a snapshot; the table is what you keep current.

| Item | Value |
|---|---|
| Base | `ORM-APP-ConvexPress Standalone Roadmap`, base id `p5771rm40m4pjw4q4t4x9kdbb18dnm0b` |
| Table | **Blocks**, table id **`q97ft31dnn52vbeha9fdd3zfg98dv4sq`** |
| Rows at handoff | 125 blocks: 51 that exist today (38 core registry entries + 13 portable), 74 planned, 15 flagship (`Priority = P0 Flagship`) |
| Owner note | There is also the VO base `ORM-APP-ConvexPress (APP-CVPR)` (`p574t1p1xvkpsrgjk2v6zma8an89tr11`). The tracker lives in the Standalone Roadmap base; do not fork it into the VO base unless the owner asks. |

Columns and what they mean: `Name` (spec name, e.g. `core/feature-grid`, the upsert key), `Title`, `Category` (inserter category), `Tier` (Library / Pack / Plugin / Composed), `Role` (hero, opener, content, cta, aside, utility), `Status` (Planned → Spec written → In progress → Built → Verified; Verified means tests green and a screenshot under every first-party pack), `Phase` (from §4), `Priority`, `Exists Today`, `Current Location`, `Spec Path` (target `blocks/<ns>/<name>/block.json`), `Description`, `Key Fields`, `Dynamic` + `Data Resolver`, `Supports Children`, `Layout Intents`, `Treatment: Journal` / `Treatment: Depot` (Baseline / Named style / Owned renderer / Missing; set on flagships as the target, blank elsewhere until Phase 3), `Named Styles`, `Tests`, `Screenshots`, `Plugin`, `Migrates From`, `Owner`, `Notes`.

Rules:
1. **Before building or migrating a block, its row must exist.** Add a row for any block you introduce (pack signature blocks, plugin blocks, promoted composed blocks) with `Name`, `Category`, `Tier`, `Role`, `Phase`, `Spec Path`, `Description`, `Key Fields`.
2. **Update `Status` as you go**, and tick `Tests` and `Screenshots` only when they exist in the repo. Fill `Treatment: Journal` / `Treatment: Depot` for every row during Phase 3 (Baseline is a valid, expected value for most).
3. **`sync:blocks` must reconcile against this table**: the generator reads the repo's `block.json` files; extend `check:blocks` with a `--tracker` mode that pulls the table (`mt table records q97ft31dnn52vbeha9fdd3zfg98dv4sq --fields Name,Status,Spec Path --format compact`) and fails on a block that exists in the repo but not in the table, or is `Verified` in the table without tests and screenshots in the repo.
4. **Renames** (for example the client-derived `blocks/grade-gallery`) are a row update plus `Migrates From`, never a second row.
5. Do not edit the table schema without recording it here.

CLI (account `master` is already signed in on this Mac):
```
mt table schema q97ft31dnn52vbeha9fdd3zfg98dv4sq
mt table records q97ft31dnn52vbeha9fdd3zfg98dv4sq --fields Name,Status,Phase,Priority --where Phase="Phase 1"
mt row create-record q97ft31dnn52vbeha9fdd3zfg98dv4sq --set Name=journal/editorial-spread --set Tier=Pack --set Category=Marketing --set Status=Planned
mt row patch q97ft31dnn52vbeha9fdd3zfg98dv4sq --where Name=core/hero --set Status="In progress"
mt populate rows q97ft31dnn52vbeha9fdd3zfg98dv4sq --file rows.json --upsert-by Name --dry-run   # bulk, then --yes
```
The generator script that produced the initial rows is kept at `ConvexPress-Admin/output/blocks-tracker/gen_rows.py` with its `rows.json`; re-running it with `--upsert-by Name` is safe.

## 7. Coordination rules (unchanged from the template handoff)

- Check `git log --stat -5` before touching shared areas; the repo auto-commits every few minutes.
- Do not kill processes on shared ports (4105 admin renderer, 4201/4203 storefronts, the SSH tunnel) without checking who owns them.
- One browser-driving flow at a time; headless Playwright or throwaway-profile Electron for verification.
- Packs never import `convex/react` or the generated `api`; blocks never call `useQuery` after Phase 5.
- No `rm -rf`, ever. Delete only named files the owner asked to remove or that this handoff lists for retirement.
- Template SDK type changes (`TemplateManifest.blocks`, primitives) affect the pack work you have in flight; land them first in a small commit and update plan §16 in `TEMPLATE-SYSTEM-PLAN-2026-09-04.md`.

## 8. Decisions already made (do not reopen)

1. Source of truth is a root `blocks/` folder synced into both apps and the backend.
2. Runtime AI elements are compositions over primitives, never code; code is the build-time path via skills, with promotion between.
3. Rich text is a block; TipTap stays for inline editing only.
4. Layout is intents on the instance; the template maps intents to treatment.
5. Dynamic data is server-side through the resolver registry.
6. The baseline lives in the SDK; Core is baseline plus neutral tokens; no pack inherits from a pack.
7. One default treatment per block (the Library renderer); no separate field-built fallback.
8. Block-kit is rebuilt after Phase 1, not patched.

## 9. Progress table (Astra keeps this current)

Updated September 20 from current source and dated acceptance receipts. “Implemented” does not mean the whole phase is accepted. Earlier dated notes below remain historical.

| Item | State | Where / evidence | Remaining acceptance or implementation |
|---|---|---|---|
| Phase 0 — truth and tests | Contract/security checks implemented; partial rendered acceptance | Root block/catalog tests and `output/block-layout-motion-20260916`; current `check:blocks` and generated parity pass | Full per-block interaction/data/editor/visual acceptance; no library-wide premium-quality verdict |
| Phase 1 — schema first | Runtime integration implemented: 137 specs / 285 examples | `blocks/`, generated contracts, native schema controls; `output/definition-promotion-editor-20260916` | Complete installed-catalog/editor acceptance, including all supported field states |
| Phase 2 — one content model | Canonical editing, revisions, reusable definitions and recovery implemented; legacy retirement incomplete | `canonicalDocuments`, `syncedBlocks`, canonical editor; content migration references in block-kit | `contentMode` remains in schema. Deployed migration supports legacy block trees and page sections; one heading page completed native conversion, Website rendering and original-editor recovery on disposable target4870. A bounded structured article also completed native conversion to 22 blocks, actual Website desktop/mobile rendering and original-editor recovery with original fields preserved (output/structured-migration-20260920). Unsupported structured fields/capacity and inactive layout/lock intent still refuse; full legacy render acceptance and retirement remain open |
| Phase 3 — SDK and template control | SDK baseline and four installed packs; 32 starter patterns; closed layout controls wired to all11 SDK variables | SDK primitives, pack manifests/owned renderers; four-pack/five-layout desktop/mobile proof in output/default-pack-review-20260920; historical example and scoped hardware motion proof | Finish flagship pack treatments and full visual/motion/state signoff; verify switching on final content |
| Phase 4 — live editor | Live unsaved Website pane and selection/highlight; bounded undo/redo; multi-selection and lock-aware bulk removal; core keyboard workflows implemented and selectively accepted in owned Electron | `output/live-editor-20260920/acceptance-review.md`, `output/editor-history-20260920/acceptance-review.md`: no preview/history writes, explicit save/reopen, post-save undo semantics and stable rendered DOM | Aster House hosted staging and Journal/Depot local Heading/Paragraph live-editor acceptance passed; hover accepted locally in Core. Visual block inserter has548 per-pack thumbnails with scoped Core native acceptance. Tabbed Blocks/Patterns/Saved/Create integration and native pinned/latest/pattern/custom insertion with Undo are accepted locally (`output/inserter-workflows-20260920/acceptance-review.md`); Create is the existing whole-page AI composer. Diagnostics and canonical management accepted on local target and Aster staging:137 entries, bounded editable-document scans and incomplete-usage handling (`output/block-diagnostics-20260920/acceptance-review.md`). Create now integrates description/manual element creation, reviewed draft, Website preview, approval and insertion; native manual workflow and page preservation accepted (`output/editor-element-creation-20260920/acceptance-review.md`). Live permission grant/revocation and missing-provider-key recovery accepted (`output/editor-ai-live-20260920/acceptance-review.md`); successful AI generation needs an authorized provider key on the disposable site. Cloud hover rollout and broader keyboard/selection polish remain open |
| Phase 5 — data and AI | Scoped resolver planning, SSR, selected-resource AI, immutable custom definitions/style/promotion implemented | `blockDefinitions`, canonical data foundation; September16 compose/style/promotion receipts | Natural-language resource discovery and wider dynamic/media/child-slot/provider acceptance; static promotion is not the full matrix |
| Phase 6 — library, packs, kits | All 137 renderers and all eight kit workflows distributed; four packs and internal BlockDemo | `block-kit/skills`, `output/block-kit-completion-20260920`, Standalone MagicTables | Per-skill end-to-end prompt acceptance, all-block polished behavior and pack demo/site acceptance remain required |
| Original Astra audit and template handoff | Active; not superseded by block progress | `ConvexPress-Admin/audits/2026-09-04/implementation-ledger.md` | Original 24-item audit and Customizer/SDK/provider/fleet/packaging gates remain open. Main source integration completed September20; see sdk-ci-and-source-integration-outcome.md |

## September 5 integration notes

Schema migration refinement approved by root on September 5: the closed field vocabulary remains sixteen types, with explicit scalar repeater items, numeric select values, flat media-ID and href storage forms for lossless imports. `reference.of` additionally permits `tag` and `user`: tags require intended target-taxonomy resolution; users require a reviewed exact source-to-target author mapping, never customer copying or email guessing. Nonempty unresolved/wrong-target references fail. New optional `migration` metadata records `fromVersion`, preservation of legacy render output, and bounded `empty-to-null` / `pack-treatment` paths. These are staged contracts; the existing runtime does not execute them. The original revision and old Website render attrs must survive until accepted rendering replaces them.

The owner asked Claude to provide the spec for implementation in Astra’s isolated hardening worktree. The spec supersedes the earlier ledger characterization of the content-model rewrite and expanded block library as unadopted proposals. All seven phases above are now tracked requirements; none is being substituted by the prior bounded validation repair.

Existing work to preserve: rejection of unknown names at write boundaries, expanded portable-block AI catalog, safe AI JSON extraction, nested disabled-block duplication checks, revision recovery, and Aster House’s Field Guide / Upcoming Events demonstrations. These must migrate to the generated contracts rather than grow the handwritten registries. Current block trees still use `innerBlocks`, old content models remain, and the SDK/renderer/editor composition contracts above are not implemented.

Promotion is being built alongside this work. Its block dependency scanner and ID mapping must consume the generated reference/media field metadata and accept the new `children` tree before the unified model is activated. Saved snapshots and revisions must retain lossless pre-migration content.

## Owner additions — inventory refinement and BlockDemo

The owner explicitly authorizes Astra to refine Claude’s complete block inventory, add missing blocks and supporting work to the new Blocks table in the Standalone ConvexPress MagicTables base, and implement the entire resulting inventory. This is additive completion scope, not a fixed limit of roughly120 blocks. Resolve the finished handoff/table schema and deduplicate before writing while Claude is populating it. Currently resolved standalone base: `p5771rm40m4pjw4q4t4x9kdbb18dnm0b` (ORM-APP-ConvexPress Standalone Roadmap), Blocks table `q97ft31dnn52vbeha9fdd3zfg98dv4sq`. Live names/schema were inspected via mt; rows are still being created by Claude.

The final collection must include several simple, well-styled default templates, with a finished basic treatment for every block. Create an internal **BlockDemo** website that presents every block in organized categories, using a shared content set across the default packs. It is not shipped as a customer starter; later public promotion is a separate decision. Use real rendered desktop/mobile and keyboard checks, meaningful content variants and dynamic loading/empty/error states where applicable. Coverage must enumerate the complete approved inventory, actual rendered block states and pack names, not infer success from renderer-file presence. This site supplies the screenshot matrix and makes visual gaps directly reviewable.

## September 5 — tracker refinement and motion acceptance

Astra added11 reviewed inventory entries and reconciled planned `events/event-list` into the existing `events/upcoming` row (no duplicate). The complete live readback contains136 unique named blocks. Added names: `core/synced`, `core/definition-list`, `business/opening-hours`, `business/locations`, `business/service-list`, `business/menu`, `commerce/wishlist`, `commerce/download-library`, `core/search-results`, `reference/field-guide`, `local/sample-alert`. Rationale and field contracts are in row Notes and `ConvexPress-Admin/output/blocks-tracker/astra-additions-2026-09-05.json`. Source presence is separate from new-contract completion. No new block is marked Verified. Event row metadata now matches the preserved generated v1 attrs and proposed page-level resolver.

The owner additionally requires premium visual design, gorgeous smooth animations and no stuttering or pixelated gradients. Current inspection finds Framer Motion12.38.0 in Admin; Website declares tw-animate-css but no Motion, GSAP or WebGL runtime. Verify the shared SDK motion choice before installing; use compositor-friendly transforms/opacity and bounded visible work, preserve reduced-motion behavior, and profile actual BlockDemo frames/paint costs at tested sizes/DPRs. GPU availability alone is insufficient acceptance. Each default pack must receive real visual and motion review.

Original imagery is explicitly authorized, with UploadThing API/account setup authorized as an alternative if Convex storage proves inadequate. Convex already stored Aster images successfully; no UploadThing dependency or account was created by Astra. The first original BlockDemo photo, exact prompt, hash, alt text and crop focal point are stored in `output/block-demo/`; it is not uploaded or attached to a completed site yet.

### September 5 canonical inventory and inline-content checkpoint

All 136 verified tracker names now have canonical specs: 54 migrated existing
contracts plus 82 newly authored planned contracts. Proposed tracker updates are
in `blocks/.migration/planned-contracts.json`; no runtime or Verified status is
implied by this coverage. Generated metadata now carries closed plugin/capability
requirements, typed target references, and cross-field constraints. Structural
containers use children/shared layout intent; visual ratios, gaps and motion stay
in template treatments. Missing dynamic/reference/security adapters must refuse
activation. HTML/iframe/script specifications are declarations pending their
reviewed safety implementations.

Paragraph/rich-text bodies and heading/list inline content now use the same closed
TipTap-compatible `RichTextDoc` vocabulary as SDK RichText, including hardBreak,
bold/italic/strike/underline/code/link marks. Heading/list fields use the same
storage with a single-paragraph restriction. The staged v1-to-v2 converter retains
original revisions and exact legacy renderer inputs and distinguishes legacy
Markdown from literal prose. Unsupported structural editor nodes require explicit
tree mappings and fail rather than flattening. Runtime registration and actual
stored-record/pack acceptance remain separate root-owned gates.

### Canonical table/anchor refinement (staged)

The generated `matrix` constraint supports a declared nested `rowField` and `headerOffset` of 0 or1, in addition to existing scalar row arrays. Pricing values associate exactly with plan count; comparison cells associate with authored columns excluding their label column. Missing headers with populated rows and mismatched widths fail with a path, preserving the original legacy record for repair. `columns:null` remains permitted only with no rows. Footnote keys use the existing anchor format and within-block uniqueness; page-wide anchor collisions require tree preflight before activation. No formatter/renderer may silently pad, truncate, rename keys or invent header labels.

### Approved composable treatment refinement (2026-09-05)

Root approved optional instance `treatment: {name, values}` beside attrs/style/layout, with a closed generated validator per block. This separates authored visual intent from content without creating combinatorial public named styles. Initial `reference/field-guide` treatment `editorial` preserves spacing 0–8, physical alignment left/center/right, ink foreground/primary/muted and font body/display. All axes are required when treatment is present; defaults are spec metadata for deliberate editors/converters. Four pack `template.json` files declare `blocks.treatments: {"reference/field-guide":["editorial"]}` and actual SDK mappings must support each axis. Unknown/missing axes and unsupported active-pack treatment are errors. Existing `style` remains independent; no raw CSS or arbitrary JSON intent is accepted. Actual legacy conversion uses the generated compatibility artifact and does not invent a legacy-only permanent style identity. Service activation requires old/new rendered equivalence, not merely schema acceptance.

## September 20 current library and pricing milestone

Full source-discovered example matrix:137 blocks/285 examples × four packs ×1440/390px,2280 captures and eight completed browser cases. Added actual generated-form submission preservation across all285 examples. Visual review found and repaired pricing cards reserving unused columns and misaligned actions; three final browser cases cover all four packs at1440/900/390px with0–6 plans, add/remove/reset, maximum-length copy and retained destinations.281 renderer tests/4936 assertions, Admin/Website/demo types, block/thumbnail checks, demo build and focused lint pass. Four pricing thumbnails refreshed; one existing MagicTables block row updated and all137 read back. Evidence: output/block-library-current-20260920/acceptance-review.md. The full matrix predates only the pricing repair and its final focused evidence supersedes those16 pricing captures; other136 source pairs match. Fixture/DOM evidence does not close native persistence, full visual/motion/live-data acceptance or original production gates.


## September 21 block review and browser failure closure

Two product fixes are verified: purchase-download responses cannot outlive their mount/authority generation, and Depot embedded-form headings/fields adapt to available container width. Seven download behavior cases and focused form checks pass. The broad browser sweep recorded142 pass/eight skip/three fail; all three failures have passing targeted reruns after repairing gallery example selection and Wishlist demo stylesheet loading. The gallery rerun captures137 blocks × four packs × two viewports (1096 selected specimens), not all285 examples. Production demo form/Wishlist checks pass; source types/builds, contract freshness, kit tests and focused lint pass. Selected screenshots reviewed. SDK docs now distinguish integrated custom-block APIs/static promotion from remaining data/media/child-slot acceptance. See `ConvexPress-Admin/audits/2026-09-04/block-review-20260921.md`. Three MagicTables Notes updates retain full-block completion flags. No live backend mutation. Original audit remains five accepted/nineteen open; full native/live/visual/motion/template acceptance remains open.


## September 21 hardware motion and viewport entrances

Current headed hardware matrix passes32 cases for SDK text/image marquees across four packs,1440/390,DPR1/2 on Apple M5 Metal:3840 frames, worst8.8ms, no long tasks or steady animated-layer paints. Four card entrances (UGC, social feed, search results, downloads) previously ran below the viewport; they now use per-card one-shot reveal refs with cleanup, focus settling and reduced-motion/static fallback. Five new browser cases pass in development/production; nine existing interaction cases and283 renderer tests pass. Four additional Core desktop production entrance samples have accelerated transform/opacity layers, no long tasks and worst7.9ms. Types/builds/freshness/lint pass. See `ConvexPress-Admin/audits/2026-09-04/motion-review-20260921.md`. Five MagicTables Notes updates preserve complete-block flags. This is scoped hardware/behavior evidence, not every block/device motion or release acceptance; original audit remains five accepted/nineteen open.

September21 follow-up: Phase5 lead-magnet production-host lifecycle repaired and covered by eight isolated real-provider cases; four-pack desktop/mobile UI flows also pass. Source-derived inventory metadata is reconciled separately from full acceptance. Details and remaining native/live/motion requirements: `ConvexPress-Admin/audits/2026-09-04/lead-magnet-lifecycle-20260921.md`. No phase or full block delivery is newly declared complete.


September21 inactive-settings migration follow-up: explicit per-block review now handles known unused legacy layout/locks without activating them or losing the recoverable original. Missing acknowledgement and stale source are server-refused. Native isolated conversion/edit/reopen/Website rendering/original recovery passed; all42 original pages preserved. See `ConvexPress-Admin/audits/2026-09-04/inactive-migration-20260921.md`. Phase2 remains open for other unsupported structured/mixed-tree/render cases and fleet retirement; no full block acceptance flag advanced.


September21 Paragraph:2k→20k canonical text capacity is backward-compatible for existing v2 documents. Real native migration/edit/save/publish/withdraw/original recovery and public desktop/mobile output verified on isolated4860; four-pack generated editor/render checks pass. See `ConvexPress-Admin/audits/2026-09-04/paragraph-migration-20260921.md`. Other structures, mixed-tree/fleet retirement and complete block/template acceptance remain open.


September21 native block layout: Heading/Paragraph/Divider/Spacer authored and saved in Electron, four-pack public desktop/mobile checks pass. Added declared width/tone/spacing/alignment and instance-anchor controls with draft/undo/CAS/validation guards. Fixed Spacer retaining64px for spacing=none and announcing an empty region.291 renderer and6 editor/adapter/composition checks pass; types/build/freshness pass. Original42pages and complete appearance values restored; owned fixtures/sessions/processes cleaned up. Evidence: ConvexPress-Admin/audits/2026-09-04/core-text-layout-20260921.md. Original audit8accepted/16open; full-block statuses remain open.


September21 family closeout: core/heading, core/paragraph, core/spacer and core/divider now have current contract/editor/public/four-pack visual acceptance; MagicTables advances these four to Verified with exact evidence. Heading empty accessibility and size hierarchy are repaired. Remaining133 blocks, full templates, dynamic/provider/SDK/fleet/legacy-retirement and release requirements remain open. See `ConvexPress-Admin/audits/2026-09-04/core-family-20260921.md`.

September21 editorial family closeout: core/list, core/definition-list, core/quote, core/pullquote, core/callout and core/code advance to Verified after native authoring/save/reopen/publication/recovery, four-pack desktop/mobile review and complete tracker readback. Code newline loss and missing highlighting, list markers, quote links and long-text overflow are repaired. Total10/137 verified;127 pending. Original audit8accepted/16open and full template/SDK/fleet/production requirements remain open. Evidence: `ConvexPress-Admin/audits/2026-09-04/content-family-20260921.md`.
