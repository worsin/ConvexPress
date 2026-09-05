# Block system: state analysis and target design (2026-09-05)

Analysis only. No code was changed. Astra is active in `templates/packs/*`; nothing here has been started.

Goal restated by the owner: a hybrid. A large library of pre-built blocks with real functionality, visible and editable as data in the admin, rendered and styled by the active template on the front, plus the freedom for AI to build bespoke elements on the fly. "No amount of change is too much."

---

## 0. TL;DR

The block system is the oldest untouched subsystem in the repo (last real change 2026-06-07; three months behind the template system). Its core ideas are right: content is a flat block list of `{id, name, version, attrs}`, the admin edits data only, the website renders, AI composes pages from a catalog. Its execution is where it falls down:

| Area | State |
|---|---|
| Content models | Three coexist: block list, TipTap article JSON, legacy page sections. Two separate renderers on the website. |
| Block metadata | Hand-maintained in five places (type union, schemas, 2,600-line registry, AI catalog package, outline icon map), only block *names* machine-checked. |
| Admin ↔ Website | Zod schemas physically duplicated in two repos; CI only checks that a folder exists across a hardcoded `../ConvexPress-Website` path. |
| Template control | None. Packs wrap the block list; every pack emits byte-identical block markup. No block styles, no layout intents, no per-pack renderer override. The layout contract in `block-kit/CONTRACTS.md` exists in no code. |
| Editor UX | Form-only outline. No preview of any kind. Nesting is typed but cannot be authored. No patterns, synced blocks, locking, visibility, undo, block autosave. |
| AI | Solid sandbox (attrs only for known names), but locked to the 38 core blocks: the 13 portable blocks and their `aiHints` never reach the model. Nested output is silently dropped. Freeform JSON in a code fence, no structured output. N+1 sequential mutations per generated page, each writing a revision. |
| Backend | `attrs` is `v.any()`. Unknown block names skip validation entirely. Migration engine has never had a migration. `reusableBlocks` table is orphaned TipTap-era. |
| Dynamic blocks | Fetch client-side inside the renderer with `api as any`, outside the loader: no SSR, one round trip per block, counts against the 8-query concurrency cap. |
| Bundle | Every core block, portable block and all ~285 pack surfaces are eagerly imported. |
| Tests | Zero for blocks in all three layers. |
| Kits | `block-kit` docs describe APIs that no longer exist and contradict the skills; block-kit is absent from the kits roadmap. |

The fix is not a patch list. It is a re-foundation on one principle: **a block is a data contract; the template owns rendering; AI may author both the data and, within a safe vocabulary, the rendering.** Everything below follows from that.

---

## 1. What exists today (facts, with file refs)

### 1.1 Content model
- `posts.blocks: ConvexPressBlock[]` where `ConvexPressBlock = {id, name, version, attrs, innerBlocks?}` (`ConvexPress-Admin/apps/web/src/lib/blocks/types.ts:75-81`; backend `schema/posts.ts:130-166`). `contentMode: "article" | "blocks"`.
- `innerBlocks` is walked by migrate/normalize/plain-text helpers but no UI creates it; the TipTap importer flattens columns (`lib/blocks/tiptap-to-blocks.ts:263`).
- Legacy `layout` (tone/padding/container/align) and `lock` are actively stripped on validation (`lib/blocks/validation.ts:36-51`, backend `blocks/helpers.ts:23`).
- Article mode: `posts.content` is TipTap JSON rendered by a separate 735-line `components/blog/BlockContentRenderer.tsx` on the website, which is the only place alignment and full-bleed exist.
- Legacy `pageSections` convert to blocks at read time, discarding their presentation (`lib/blocks/page-sections.ts:12-16`).
- Persistence: `saveBlocks()` migrates → structural validation → catalog spot-check → revision snapshot (JSON string) → patch (`convex/blocks/mutations.ts:98-140`). Optimistic concurrency via `blocksRevision`. The client only ever calls `replaceBlocks` (debounced 800 ms); the five granular mutations are unreachable.
- Autosave is a string on the post (`autosaveContent`); block trees are not autosaved. `MIGRATIONS = []` on both sides; every per-block `migrations.ts` is an unimported identity stub.

### 1.2 Definitions and registries
- Admin: `AdminBlockDefinition` (`types.ts:100-119`) with Zod schema, `Editor`, `defaultAttrs`, `supports` (only `multiple`/`media` ever set, neither read), `aiHints`, `rendererStatus` (never set on core, always `"ready"` on portable, never displayed).
- 38 core blocks inline in `lib/blocks/registry.tsx` (2,642 lines) plus 13 portable blocks discovered by `import.meta.glob("../../blocks/*/manifest.tsx")` and one `blocks.local` sample. Portable blocks use the clean four-file layout (`block.json`, `schema.ts`, `Editor.tsx`, `manifest.tsx`); core blocks never migrated to it.
- Website: `WebsiteBlockDefinition` (`lib/blocks/types.ts:79-87`) with a duplicated Zod schema and `Renderer`; 38 core renderers inline in its own 1,400-line registry; same glob discovery.
- AI catalog: `packages/blocks-catalog/src/index.ts` (873 lines) hand-duplicates title/description/category/fields/example for the 38 core blocks only.
- `bun run check:blocks` (`scripts/admin/check-block-catalog.mjs`) is a regex on `name: "..."` comparing core names between registry and catalog, plus a folder-existence check into the sibling repo. It does not compare fields or schemas and ignores every non-core block.
- Source provenance is inferred from the name prefix, not the folder the block was loaded from (`registry.tsx:2579`).

### 1.3 Admin editor
- `components/blocks/BlockOutline.tsx` (1,478 lines): Notion-style rows, dnd-kit reorder, insert gaps, category-filtered inserter, duplicate, delete, swap type, disabled-block enforcement, per-block AI menu (regenerate, three variants, shorter/longer/tone presets, swap) wired to `blocks.ai.*` actions, collapsed one-line preview from a hand-written `switch` on block name.
- Expanded row renders `definition.Editor` (plain form). Field primitives in `blocks/_shared/editorFields.tsx`: text, number, textarea, select, checkbox, repeater; media via `MediaField` (library/upload/AI generate). No link picker, no rich-text field, no colour or spacing (by design), no responsive controls.
- `BlockOutlinePanel.tsx` is a read-only jump list with its own hand-maintained icon map.
- `PageGenerationPrompt.tsx`: whole-page generate (empty page) or draft-then-confirm (existing blocks).
- No iframe, no canvas, no knowledge of the active template pack.

### 1.4 Website rendering
- `components/blocks/BlockListRenderer.tsx`: hardcoded `flex flex-col gap-6 md:gap-8`, per block `getBlockDefinition` → Zod `safeParse` → `<section data-slot="block-<name>">`. Unknown or invalid blocks render nothing in production, with no telemetry. Disabled blocks still render (only marked).
- Six call sites; each pack's `page.tsx` and `blog.post.tsx` wraps the identical renderer. `opensWithHero` and `HERO_BLOCKS` are copied verbatim in three files.
- Shared primitives are four helpers in `blocks/_shared/rendering.tsx`; the core registry has its own private duplicates. No Section, Container, or Heading primitive; every block hardcodes its own `max-w`, `py`, `gap`, `rounded`, grid.
- Blocks use token classes only and inherit the Customizer's colour, font and radius variables automatically. `--type-scale` and `--content-max-width` are not consumed by any block; there is no spacing or density variable.
- Dynamic blocks (`product-showcase`, `category-tiles`) call `useQuery((api as any)…)` inside the renderer. `product-collection` bakes products into attrs. `core/latest-posts` and `core/featured-products` are attrs-only stubs.
- All globs are `eager: true`; nothing is lazy.

### 1.5 Backend and AI
- Arg validators check the envelope only; `attrs: v.any()`. `validateBlocksAgainstCatalog` spot-checks string max, literal unions and primitive types for catalog fields present, and **skips any block whose name is not in the catalog** (`blocks/helpers.ts:118-124`). Disabled-block checks are missing on `updateBlockAttrs` and `moveBlock`.
- `blocks/ai.ts` (560 lines, node runtime): `generatePageDraft`, `generatePage`, `regenerateBlock`, `improveBlock`, `generateVariants`, `swapBlockType`, routed through `ai.internals.generateWithClaude` with provider/model from the `ai` settings section (page model default Opus, block model default Sonnet). Prompt inlines the whole catalog; output is a JSON array in a code fence, extracted with a bracket scanner. `normalizeBlockFromAi` rejects unknown names, drops `innerBlocks`, caps at 60 blocks, de-duplicates heroes. Generation then issues one `insertBlock` mutation per block sequentially so the reactive query animates them in.
- Tables: `posts` (blocks, blocksVersion, blocksRevision), `revisions` (JSON string), `reusableBlocks` + `editorLocks` (TipTap-era, unconnected). No `blockDefinitions`, no `patterns`.
- Settings: `blocks.disabledBlockNames` only. No block-level capabilities; everything is `page.update` / `post.update` / `manage_options`.

### 1.6 Kits, skills, tests
- `block-kit/` (root): six short docs and four stub references, all from 2026-05-30. `DATA-API.md` lists `updateBlockLayout` (does not exist); `CONTRACTS.md` documents the layout contract as live; `WORKFLOW.md` describes editing the monolithic registry while the skills forbid it; README lists 8 core blocks.
- Skills: `block-build`, `block-add-feature`, `block-audit` (Admin `.claude/skills`, mirrored in `.codex/skills` and `agents/admin/codex-skills`). Build-time only; a block built this way is invisible to AI generation and rejected by `swapBlockType`.
- `plans/codex/KITS-ROADMAP.md` does not mention block-kit.
- Tests: none in `lib/blocks`, `blocks/`, `components/blocks`, `packages/blocks-catalog`, `convex/blocks` in either repo.

---

## 2. Diagnosis: the eight root problems

1. **No single source of truth for a block.** Name, fields, defaults, hints and renderer status live in five hand-edited places across two repos and a package, with a regex as the only guard. Every new block is a five-file, two-repo chore, and drift is invisible.
2. **The template has no say in how a block looks.** Presentation is hardcoded in each renderer. The one lever the design intended (layout intents) was stripped and never replaced. Journal and Depot, which differ everywhere else, render identical blocks.
3. **The admin cannot show the result.** Authors edit forms and must visit the live site to see anything. The Customizer already solved the live-iframe-with-draft problem; the block editor does not use it.
4. **AI is fenced into 38 blocks and flat lists.** Portable blocks, plugin blocks and nesting are invisible to it, and it has no path to create a new element. This is the opposite of the stated goal.
5. **Three content models and two renderers.** Article mode, block mode and page sections each have their own code paths, and features (alignment, full-bleed, tables, galleries, callouts, custom HTML) exist in one but not the other.
6. **The server trusts the browser.** `attrs` is untyped, unknown names skip validation, so a compromised or buggy client can persist anything.
7. **Dynamic blocks are client waterfalls.** No loader participation, no SSR, no shared data API, and each block spends one of eight query slots.
8. **Nothing is tested and the docs lie.** The integrity layer for all page content (validation, migration, TipTap import, AI extraction) has no tests; the kit describes a system that does not exist.

---

## 3. Target design

### 3.1 Principles
1. **One block spec, everything derived.** A block is defined once, as data. Zod schema, TypeScript types, server validators, the AI catalog, the default editor form, the inserter card and the coverage matrix are all generated from it.
2. **Blocks carry intent, templates carry treatment.** A block instance may say "this section is wide, muted, spacious, centred". Only the active pack decides what those words mean in pixels, and packs may replace a block's renderer or offer named styles.
3. **The admin shows the truth.** The editor previews the page through the real website in the real template, live, with click-to-select. It never re-implements rendering.
4. **AI is a first-class author at every level:** page, section, block, field, and *new element*. Bespoke elements are composed from a safe primitive vocabulary and can be promoted to real code by a skill.
5. **The server is the boundary.** Every saved block is validated against the same spec the client used. Nothing unknown is stored.
6. **One content model.** The block tree is the only page content format. Rich text is a block. Article and page-section content migrate in.
7. **Everything is a folder you can copy** (blocks, styles, patterns), and every folder is discoverable without registry edits.

### 3.2 One content model
- Block tree with real nesting: `{id, name, version, attrs, children?, layout?, style?, visibility?, lock?, anchor?}`.
- `layout` is intent-only: `{width: "contained"|"wide"|"full", tone: "default"|"muted"|"inverted"|"accent", spacing: "none"|"compact"|"default"|"spacious", align: "start"|"center"}`. The pack maps these to real treatment (see 3.5). This resurrects the documented layout contract as intents rather than pixels, which is why it was stripped last time.
- `style` is a named style id offered by the active pack for that block (falls back to `default` under any other pack).
- `visibility` reuses the menu system's visibility rules (role, signed-in, plugin enabled, schedule, device).
- `lock`: `{move, remove, edit}` honoured by the outline, for template-provided page skeletons.
- Rich text becomes `core/rich-text` holding a TipTap document; the article renderer's node set (table, gallery, callout, columns, html) is folded into blocks so the TipTap renderer only handles inline content.
- Migration: a one-time backend migration converts `contentMode: "article"` posts to a single `core/rich-text` block (or a split into blocks via the existing importer where it is lossless) and converts `pageSections`; `contentMode` is then removed from the schema. Revisions keep their JSON strings.
- Block-tree autosave: `posts.autosaveBlocks` alongside the string autosave, and recovery in the existing dialog.

### 3.3 Schema-first block definitions
One canonical `block.json` per block, schema-rich:

```json
{
  "name": "core/feature-grid",
  "title": "Feature grid",
  "category": "marketing",
  "role": "content",
  "version": 2,
  "keywords": ["features", "benefits", "columns"],
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
  "supports": { "children": false, "styles": true, "layout": ["width", "tone", "spacing"], "anchor": true },
  "data": null,
  "examples": [ { "title": "Why teams switch", "items": [ { "title": "Fast", "body": "..." } ] } ]
}
```

Field types form a closed vocabulary with a real editor control and a real validator each: `text`, `richtext`, `number`, `boolean`, `select`, `link` (picker for pages, posts, products, external, anchor), `media` (image/video with alt, focal point), `icon`, `color-role` (a token role, never a hex), `date`, `repeater`, `reference` (product/post/category/course pickers), `menu`, `form` (Forms extension), `object`.

Derived, by a generator run through `bun run sync:blocks` (same pattern as `sync:templates`):
- Zod schema and TS types for both apps.
- Convex validators for `attrs` per block name, so `v.any()` goes away and the server rejects unknown names.
- AI catalog entries (with examples) for **every** block, core, portable, pack-shipped and plugin, filtered by enabled plugins and disabled blocks.
- A default `Editor` from the field types; a hand-written `Editor.tsx` remains optional for exotic cases.
- Inserter metadata, outline preview (a `preview` template string like `"{title} · {items.length} items"`), and the coverage matrix.

Location: one source folder per block, `blocks/<name>/` at the monorepo root (`block.json`, optional `Editor.tsx`, `render.tsx`, `migrations.ts`, `README.md`, `tests/`). The sync script copies derived files into both apps and the backend; CI fails on drift. Plugin blocks live in the plugin folder and register through the plugin manifest (`surfaces`, `dashboardNav`, and now `blocks`). Pack blocks live in the pack.

Core blocks move out of the two monolithic registries into this layout. `check:blocks` becomes a real check: spec parse, generated-file drift, renderer coverage per pack, snapshot render of every block under every pack, and AI example validation against the schema.

### 3.4 Three tiers of blocks (the hybrid)
| Tier | What | Who authors | Where it lives | Available to AI |
|---|---|---|---|---|
| **Library** | Pre-built, schema-first blocks with real functionality (target ~120, see §4) | Kit skill (`block-build`) at build time | `blocks/<name>/` | Always |
| **Template and plugin blocks** | Blocks a pack or plugin ships (Journal "editorial spread", Depot "deal strip", LMS "curriculum") | Pack or plugin author, via skill | `packs/<id>/blocks/`, `extensions/<id>/blocks/` | When the pack is active or plugin enabled |
| **Composed blocks** | AI-built bespoke elements at runtime, no deploy | AI in the editor ("make me a…") or the site-build skill | `blockDefinitions` table (spec + composition), rendered by the composition runtime | Immediately; can be promoted to Library by `block-promote` |

A composed block is a `block.json` spec plus a **composition**: an element tree over the SDK's primitive vocabulary, bound to the block's own attrs. Example, a bespoke "roast comparison" element for Northstar:

```json
{
  "el": "Section", "props": { "tone": "muted", "width": "wide", "spacing": "spacious" },
  "children": [
    { "el": "Stack", "props": { "align": "center", "gap": "lg" }, "children": [
      { "el": "Eyebrow", "bind": "attrs.eyebrow" },
      { "el": "Heading", "props": { "level": 2 }, "bind": "attrs.title" },
      { "el": "Grid", "props": { "columns": { "base": 1, "md": 3 } }, "each": "attrs.roasts", "as": "roast", "children": [
        { "el": "Card", "children": [
          { "el": "Image", "bind": { "media": "roast.image" }, "props": { "aspect": "4/5" } },
          { "el": "Heading", "props": { "level": 3 }, "bind": "roast.name" },
          { "el": "Stat", "bind": { "label": "'Roast level'", "value": "roast.level" } },
          { "el": "Text", "bind": "roast.notes" },
          { "el": "Button", "props": { "variant": "secondary" }, "bind": { "label": "'Shop ' + roast.name", "href": "roast.href" } }
        ] }
      ] }
    ] }
  ]
}
```

Rules that keep this safe and template-true:
- Primitive vocabulary (~25): `Section, Container, Stack, Grid, Columns, Split, Card, Heading, Eyebrow, Text, RichText, Image, Video, Icon, Button, Link, Badge, Divider, Stat, Quote, List, Accordion, Tabs, Marquee, Slot`. Each is implemented once in the SDK and **overridable per pack through `parts`** (Journal and Depot already have `parts/index.tsx`). A composed block therefore looks like the active template without the AI knowing anything about the template.
- Expressions are path lookups, string literals, concatenation and a fixed formatter set (`currency`, `date`, `plural`). No code, no arbitrary CSS, no class names. Colour, spacing and type come from props with closed enums that map to tokens.
- `each`, `if`, `bind` are the only control constructs. Depth ≤ 8, ≤ 300 nodes, validated on the server with the same validator the client uses.
- A composed block can declare `data` (see 3.7) to get live products, posts, categories, or plugin data, so "a carousel of everything on sale this week" is one prompt away.
- Escape hatches stay explicit and sandboxed: `core/custom-html` (sanitised, no scripts) and `core/embed` (allow-listed providers, iframe sandbox).
- `block-promote` turns a composed block into a Library block: spec copied, composition rendered to a `render.tsx` starting point, tests and screenshots generated. Real code becomes the long-term form; composition is the instant form.

### 3.5 Template control of blocks
Pack manifest gains a `blocks` section:

```json
"blocks": {
  "renderers": { "core/hero": "./blocks/hero.tsx", "core/testimonials": "./blocks/testimonials.tsx" },
  "styles": { "core/testimonials": ["default", "editorial", "wall"], "core/cta-band": ["default", "inset"] },
  "defaults": { "core/section": { "layout": { "spacing": "spacious" } } },
  "hidden": ["core/bento-grid"],
  "patterns": ["./patterns/*.json"]
}
```

- **The SDK ships a finished default treatment for every block (owner requirement, 2026-09-05).** The Library renderer is not a fallback; it is the baseline a new template inherits. Every Library renderer is written only against the primitive vocabulary (`Section`, `Stack`, `Grid`, `Heading`, `Text`, `Card`, `Button`, `Image`, …) and the token and layout variables, never bare layout classes. A pack therefore restyles all ~120 blocks at once through three zero-code levers, in order of effort: (1) **tokens and Customize defaults** (colours, display and body fonts, type scale, radius, content width, spacing density) set in `template.json` `defaults`; (2) **parts overrides**, replacing a primitive once (`parts/Button.tsx`, `parts/Card.tsx`, `parts/Heading.tsx`, `parts/Section.tsx`) so every block that uses it follows; (3) **per-block styles or renderers** only for the handful of signature blocks the pack wants to own. A minimal template is `template.json` plus `DESIGN.md` plus token defaults, and it must render the whole library looking finished; Journal and Depot are the proof, and the `check:blocks` screenshot matrix for a new pack is the acceptance test. This is also what makes composed blocks consistent: they use the same primitives, so they inherit the same three levers.
- **Renderer resolution** mirrors surfaces: pack renderer → Library renderer → generic composition of the block's fields (every block gets a passable fallback for free, which also covers composed blocks under any pack).
- **AI writes the pack treatment on demand (owner direction, 2026-09-05).** When a block is used under a pack that has no renderer or style for it, the system does not stop at the generic fallback: a `block-style` action takes the block spec, the pack's `DESIGN.md` and `parts`, and produces the pack's renderer for that block. At runtime this is a composition stored against the pack (`packDefinitions/<pack>/blocks/<name>`), previewable immediately; at build time the same action writes `packs/<id>/blocks/<name>.tsx` through the skill. The coverage matrix in `check:blocks` lists which blocks still run on the generic fallback per pack, so "missing treatment" is visible and one command away.
- **Template speed target**: a new template in an afternoon. Tokens and defaults (minutes), parts overrides for the four or five primitives that carry the pack's personality (an hour), signature surfaces and block treatments (the rest). The template-kit scaffold starts from Core with all Library treatments inherited, and its audit lists what is still inherited versus owned.
- **Named styles** are what the editor offers in a block's style picker; they travel with the pack, so switching packs degrades to `default`, never breaks.
- **Layout intents** resolve through pack-provided CSS variables and parts: `--block-gap`, `--section-py-{compact,default,spacious}`, `--section-max-{contained,wide}`, tone classes from tokens. `BlockListRenderer` stops hardcoding gap. `Section` is the one primitive every block wraps itself in, so full-bleed and contained finally work uniformly.
- **Roles** on the spec (`hero`, `opener`, `content`, `cta`, `footer-adjacent`) replace the copied `HERO_BLOCKS` sets and let a page surface make decisions generically ("hide the title when the page opens with a hero").
- **Patterns**: JSON block lists shipped by packs (landing page, about, contact, product story), by the Library, and saved by users. Patterns are the unit AI uses when it needs a whole section quickly.

### 3.5a Risks of a shared baseline (recorded 2026-09-05, owner asked for a straight answer)
The baseline is the standard, proven pattern (WordPress core styles + theme.json, Shopify Dawn sections, shadcn as reskinnable base) and the only way to reach "template in an afternoon". It fails in four known ways, two of them likely without discipline:
1. **Sameness.** Templates become skins if tokens and parts are the only expression. Identity must live in pack-owned surfaces (header, hero, product card, catalog, footer), structural parts overrides, and a few signature block treatments. The block baseline is deliberately the reliable middle of a page.
2. **Primitive drift.** Too coarse and authors bypass primitives with bare utilities; too fine and it is a second CSS framework. Enforce in `check:blocks`: section-level structure only through primitives; bare utilities allowed only for a block's internals.
3. **Blast radius.** One primitive change touches every block under every pack. The screenshot matrix and the `sdk` version pin in each pack manifest are the safety mechanism, not extras.
4. **Variable soup.** Keep layout variables to a fixed set of about ten (spacing scale, section padding tiers, gaps, content widths). Packs do not invent variables.

Decisions that follow: the baseline lives in the SDK, not in the Core pack, and no pack inherits from another pack (Core = SDK baseline + neutral tokens). The separate "generic fallback built from fields" is dropped; composed blocks carry their own composition, so there is one default treatment, not two. Cost: primitives + parts mechanism + rewriting the 51 existing renderers is the largest single chunk of the plan (two to four focused sessions) and converts a blocks × packs cost into blocks + packs.

### 3.6 The editor experience
- **Two panes**: outline on the left (structure and data, as today but with nesting, multi-select, keyboard navigation, undo/redo), live preview on the right rendered by the actual website through the Customizer's iframe channel (`?customize=preview` plus a `draft: { blocks }` message). Hover and click in the preview select the outline row via `data-block-id`; the row highlights the element. Device toggles reuse the Customize screen's. This costs little because the plumbing exists.
- **Inserter** shows real thumbnails per block per active pack, generated by the screenshot step of `check:blocks`, grouped by category, with "patterns" and "your saved blocks" tabs, and a prompt box: "describe the element you need" that routes to the composed-block flow.
- **Per-block AI** as today, plus "restyle for this template" (pick among pack styles), "turn into a pattern", and "split into blocks" for long rich text.
- **Whole-page AI** streams into a draft (see 3.8) with a diff view before apply, and can target a selection ("rewrite these three blocks as a comparison").
- **Synced blocks**: a `syncedBlocks` table replaces the orphaned `reusableBlocks`; `core/synced` references one; editing updates every use.
- **Block visibility, locking, anchors, style picker, layout intents** as small controls in the row header, never colour or pixel values.
- **Autosave and conflicts** for the block tree; the five granular mutations are either used (per-field patches from the outline) or deleted.
- **Diagnostics**: the Pages › Blocks screen shows renderer coverage per pack, usage, disabled state and invalid instances found by a scan, instead of the never-populated `rendererStatus`.

### 3.7 Data for dynamic blocks
- A block spec may declare `data: { resolver: "commerce.productCards", args: { slugs: "attrs.slugs", limit: 8 } }`.
- Resolvers form an allow-listed registry on the backend (products, categories, posts, authors, menus, forms, plugin resolvers registered by plugin manifests). The page query runs them and returns `data` keyed by block id with the page; the website loader gets it in one round trip, SSR renders real content, and the client subscribes to one query per page instead of one per block.
- Renderers receive `data` as a prop. Composed blocks can bind to `data.*` in their composition. The admin preview uses the same path, so dynamic blocks preview with real content.
- Reference fields (`reference` type) give the editor real pickers instead of slug strings.

### 3.8 Server truth and AI pipeline
- Generated validators per block name; unknown names rejected; disabled-block checks on every mutation; capabilities `blocks.compose` (create composed blocks) and `blocks.ai` (use generation) added to RBAC.
- `blockDefinitions` table for composed blocks (spec, composition, createdBy, status, promotedTo); `patterns` and `syncedBlocks` tables.
- AI calls use **structured output** (tool use with a generated JSON Schema of the enabled catalog) instead of a code fence; nested children are allowed; the model sees every enabled block including pack, plugin and composed ones, with the active pack's styles and patterns listed.
- Generation writes **one** `replaceBlocks` (or a streamed draft document the outline subscribes to) instead of N sequential inserts and N revisions.
- A "compose element" action: prompt plus available primitives and resolvers → spec plus composition → validated → stored as a `blockDefinitions` row → inserted into the page. Same action backs the site-build skill.
- Tests for extraction, normalisation, policy, validators, migrations and composition validation.

### 3.9 Performance
- Per-block lazy chunks (`import()` in the generated registry) and lazy pack surfaces; the page loads only the blocks it uses.
- SSR data via resolvers (3.7) removes skeleton flashes and client waterfalls.
- Bundle budget enforced in CI (`check:blocks` reports chunk sizes).

### 3.10 Kits and skills
Rewrite `block-kit` to match the system above, on the standard kit scaffold, and add it to the kits roadmap:
- `block-build` (spec-first Library block with tests, screenshots, per-pack check), `block-add-feature` (field change plus migration), `block-audit` (coverage matrix, invalid instances, bundle), `block-style` (add a pack style or renderer override), `block-compose` (runtime composed block from a prompt), `block-promote` (composed → Library), `pattern-build`, `block-migrate-content` (article/page-section conversion runbook).
- The Plugin Template and template-kit (Astra's Phase C) each gain a "blocks" section so plugins and packs ship blocks the same way they ship surfaces.
- `site-build` uses patterns and `block-compose` to author pages.

---

## 4. Library target inventory

Current: 38 core plus 13 portable plus one local sample. Target: about 120 Library blocks, all schema-first, each with a default renderer, at least one Journal and one Depot treatment for the flagship set, tests and thumbnails.

| Category | Blocks (new in bold) | Count |
|---|---|---|
| Text | paragraph, heading, list, quote, **pullquote**, code, **table**, **callout**, **rich-text (TipTap)**, **table-of-contents**, **footnotes** | 11 |
| Layout | **section**, **columns**, **group**, **grid**, **split**, spacer, divider, **sticky-aside**, accordion, tabs | 10 |
| Media | image, **gallery**, **carousel**, **video**, **audio**, embed, **before-after**, **lightbox-grid**, logo-cloud, **map**, **file-download** | 11 |
| Openers | hero, hero-split, hero-text-only, **hero-video**, page-banner, **announcement-bar**, **breadcrumbs** | 7 |
| Marketing | feature-grid, feature-list-alternating, bento-grid, stats-band, cta-band, cta-with-form, media-text, process-steps, roadmap-timeline, story-timeline, comparison-table, pricing-cards, **pricing-table**, faq, testimonials, **testimonial-wall**, **trust-badges**, media-mentions, team-grid, promo-band, **countdown**, tabbed-content, **steps-with-media**, **feature-tabs**, **marquee** | 25 |
| Social proof and social | customer-showcase, social-share, social-links, **reviews (dynamic)**, **social-feed (embed)**, **ugc-grid** | 6 |
| Commerce (dynamic) | product-showcase, product-collection, category-tiles, featured-products, assistant-band, **product-compare**, **bundle-offer**, **sale-countdown**, **recently-viewed**, **cart-cta**, **search-band**, **brand-list**, **product-hero**, **variant-picker-teaser**, **shipping-promise** | 15 |
| Content discovery (dynamic) | latest-posts, **post-grid (taxonomy query)**, author-bio, tag-cloud, **related-content**, **archive-list**, **search-box**, **featured-page**, **child-pages** | 9 |
| Forms and conversion | contact-form, newsletter-signup, booking-cta, contact-stack, **forms-extension embed**, **lead-magnet**, **poll**, **event-rsvp** | 8 |
| Plugin blocks (per extension) | LMS: **course-grid, curriculum, instructor, progress**; Events: **calendar, event-list, next-event**; Membership: **plans, gated-teaser**; Gallery and recipes: **recipe-card, gallery-album**; Support: **kb-search, ticket-cta**; Certificates: **verify-widget** | 14 |
| Site and utility | **site-info**, **menu**, **account-teaser**, **custom-html (sanitised)**, **iframe (sandboxed)**, **script-embed (allow-listed)**, **anchor-nav**, **language-switcher** | 8 |

Total: 124. Each pack additionally ships 3 to 6 signature blocks and 8 to 12 patterns.

---

## 5. Phasing

Each phase is shippable on its own and leaves every existing page working. Phases 0 to 2 never touch `templates/packs/*`, so they can run while Astra is in the packs; Phase 3 needs a small addition to the template SDK types and manifest (`blocks` section) and should be coordinated through plan §16.

| Phase | Scope | Acceptance |
|---|---|---|
| **0. Truth and tests** | Snapshot-render every block under every pack; tests for validation, migration, TipTap import, AI extraction; close the server hole (unknown names rejected, disabled checks on all mutations); delete dead contract fields; fix kit docs to describe reality | All block tests green in both repos; `check:blocks` fails on a schema drift, not just a name drift |
| **1. Schema-first blocks** | `blocks/<name>/block.json` source folder, generator and `sync:blocks`; migrate the 38 core blocks out of both registries; generated validators, catalog, default editors; AI sees every block (core, portable, plugin); lazy chunks | Adding a block is one folder plus one command; AI can insert a portable block; two registries are under 200 lines each |
| **2. One content model** | Nesting in the outline; `core/section`, `columns`, `group`; layout intents, style, visibility, lock, anchor on the instance; `core/rich-text` with TipTap; migration of article and page-section content; block-tree autosave; synced blocks and patterns tables | No `contentMode` in the schema; one website renderer; migrated demo sites render identically before and after |
| **3. Template control** | Primitive vocabulary in the SDK with pack `parts` overrides; every Library renderer rewritten against primitives and layout variables; pack `blocks` manifest: renderers, styles, defaults, hidden, patterns; renderer resolution; roles replace hero sets; Journal and Depot ship overrides for the flagship 12 blocks plus 8 patterns each | A brand-new pack made of `template.json`, `DESIGN.md` and token defaults only renders all blocks looking finished (screenshot matrix); the same page looks different and correct under Core, Journal, Depot; switching packs never breaks a page |
| **4. Live editor** | Preview pane through the website iframe with draft messages and click-to-select; inserter thumbnails per pack; style and layout controls in rows; undo/redo; multi-select; diagnostics screen | An author never has to open the site to see a change; screenshots of the editor with both packs |
| **5. Data and AI** | Resolver registry and page-level data; reference pickers; structured-output generation with nesting; single-write generation with streaming draft; composed blocks (`blockDefinitions`, composition runtime, server validation); `block-compose` and `block-promote` skills; capabilities | "Make me a comparison of our three roasts with live prices" produces a working, template-styled block in one step without a deploy; SSR shows dynamic content |
| **6. Library and kits** | Grow to ~120 blocks by category with tests and thumbnails; plugin blocks through manifests; pack signature blocks; block-kit rewrite; roadmap entry; `site-build` integration | Coverage matrix full; every block has a Journal and Depot screenshot; kit skills produce a passing block from a one-line prompt |

What not to do: do not add more blocks to the current registries, do not add per-block design controls to the admin, do not build a second renderer inside the admin, and do not let AI emit class names, CSS or code at runtime.

---

## 6. Decisions I recommend making now

1. **Source of truth location**: a root-level `blocks/` folder synced into both apps and the backend, like template packs. The alternative, a published workspace package, is cleaner but the two repos are not one workspace today.
2. **On-the-fly elements are compositions, not code.** Code stays the build-time path via skills, with promotion in between. This is the only way runtime AI elements can be safe, template-true, previewable in the admin, and server-validated.
3. **Rich text is a block, TipTap stays for inline editing only.** The article renderer's exclusive features become blocks.
4. **Layout returns as intents on the instance, not as design controls.** The template owns the mapping; the admin shows words, never pixels.
5. **Dynamic data moves server-side** into the page query through an allow-listed resolver registry.
6. **Block-kit is rebuilt after Phase 1**, not patched, and enters the kits roadmap beside template-kit and extension-kit.

Related: `TEMPLATE-SYSTEM-PLAN-2026-09-04.md` §12–§14 (kits, legacy removal, Customizer), `HANDOFF-ASTRA-2026-09-04.md` (Phase C plugin manifest, which should carry `blocks`).
