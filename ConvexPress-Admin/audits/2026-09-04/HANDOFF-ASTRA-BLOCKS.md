# Handoff to Astra: block system re-foundation (2026-09-05)

September21 shared commerce session: repaired stale authority across site/client/login/readiness changes, cross-site storage/request reuse and stale legacy-token revival after storage quota failure.16 focused tests pass; actual two-customer Clerk/cart isolation and final built mobile add/reload/remove pass. Confirmed next issue: existing owned carts are not automatically recovered on fresh sign-in. Both disposable customers and cart contents cleaned;42 pages/appearance preserved. **22/137 verified; original audit8 accepted/16 open unchanged.** [Evidence and next repair](commerce-session-20260921.md).

September21 Cart CTA: fixed viewport-based columns crushing content in narrow desktop placements. Four-pack420/760/1200-column state checks, existing desktop/mobile commerce cases and297 renderer tests pass. Actual native authoring/reopen/publication/recovery plus built Website real guest cart add/quantity/checkout link/removal and SSR privacy pass. All42 prior pages/appearance preserved. Signed-in switching, provider payment transitions and currency-scale gates remain open. **22/137 verified and original audit8 accepted/16 open unchanged.** [Evidence](cart-family-20260921.md).

September21 Shopping Assistant Band/host: repaired stale recommendations and pending sends across shopper/site/auth/host transitions and variant/price changes. Eight failing-before regressions;12 final hook cases and297 renderer cases pass. Native eight-question save/reopen/publish/recover and actual desktop/mobile one-message handoff passed. Real model answer remains unverified: test site reports missing_api_key. All42 prior pages/appearance preserved. **22/137 verified;115 pending; original audit8 accepted/16 open unchanged.** [Evidence](assistant-family-20260921.md).

September21 Product Collection and Product Showcase: **22/137 blocks verified; 115 pending.** Fixed narrow product grids, overflowing card copy and stale empty-carousel controls. Native manual/media/group/slug authoring, save/reopen/publication, actual cart additions and cleanup, live history and all11 source modes passed. Five built-demo cases cover four packs;17 backend reader tests and297 renderer cases pass. Original42 pages/appearance restored; two MagicTables rows verified. Original audit8 accepted/16 open. [Evidence](product-family-20260921.md).

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

| Item | State | Where | Notes |
|---|---|---|---|
| Phase 0 | not started | | |
| Phase 1 | not started | | |
| Phase 2 | not started | | |
| Phase 3 | not started | | |
| Phase 4 | not started | | |
| Phase 5 | not started | | |
| Phase 6 | not started | | |
| Reconciled with Astra's in-flight work | pending | | list what you already had and how it maps |
