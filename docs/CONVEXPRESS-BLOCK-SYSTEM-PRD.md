# ConvexPress Block System PRD

**Status:** Proposed
**Date:** 2026-05-20
**Owner Systems:** Page System, Post System, Content Editor System, Website Page Rendering, Design Kit, future Block Kit
**WordPress Reference:** Gutenberg block model

## 1. Summary

ConvexPress needs a first-class block system for pages and optional block-mode posts. The current structured post model works well for article content, but pages require more varied content and functionality: pricing sections, forms, galleries, sliders, feature grids, directories, maps, calculators, and other custom website modules.

The recommended architecture is a Gutenberg-inspired block model implemented in TypeScript, React, and Convex:

- The database stores ordered block instances as structured data.
- The codebase registers block types with typed schemas, admin editors, defaults, previews, migrations, and Website renderers.
- Pages default to block mode.
- Posts default to article mode but can be converted to block mode.
- AI can create new block types through a future `block-kit`, giving users a consistent way to expand what pages can do without unsafe arbitrary code or shortcode-only content.

This PRD defines the product goals, technical architecture, data model, phases, migration strategy, and a large initial core block library.

## 2. Problem

ConvexPress currently has several content mechanisms:

- `posts.content`: serialized TipTap JSON for rich editorial content.
- Structured article fields: `hero`, `topics`, `summary`, `sources`, `tableOfContents`, and `pagePrompt`.
- `pageSections`: an existing loose section composer payload stored as `v.any()`.
- Website-side `PageSectionStack`: a hardcoded renderer for a small set of page sections.

This is useful, but not enough for AI-native site building.

Pages are not just articles. A good page may need a pricing matrix, a contact form, a testimonial carousel, an image comparison section, a locations map, an FAQ accordion, a product feature table, or a custom data-powered widget. A fixed set of article fields cannot handle that without becoming a bad page builder or pushing users into raw custom code.

Shortcodes are powerful in WordPress, but they are string-based and weakly typed. ConvexPress should borrow Gutenberg's proven content model while improving on it with structured storage, typed contracts, AI-oriented generation, and React renderers.

## 3. Goals

- Make pages block-first by default.
- Keep existing post article fields and editorial workflows intact.
- Allow posts to opt into block mode through an explicit conversion action.
- Preserve all existing content and rendering functionality during migration.
- Make blocks extensible by AI through a standardized future `block-kit`.
- Provide strong type safety across admin editors, Convex validation, and Website renderers.
- Support custom functionality without arbitrary executable code in the database.
- Support reusable/synced blocks and local per-page block instances.
- Support nested blocks where they are genuinely useful.
- Save block edits in real time through Convex with optimistic UI.
- Make Website rendering SSR-compatible and SEO-safe.
- Make block definitions versioned and migratable.
- Provide a large useful core block library so most websites can be built without custom block creation.

## 4. Non-Goals

- Do not copy Gutenberg source code or PHP implementation details.
- Do not store block HTML comments like WordPress does.
- Do not allow arbitrary React, JavaScript, or HTML execution from the database.
- Do not replace the TipTap article editor in the first phase.
- Do not remove existing structured post fields.
- Do not remove `pageSections` until migration and compatibility paths are proven.
- Do not turn this into an unconstrained visual builder with unlimited layout knobs.
- Do not deploy Convex as part of implementation. Deployment remains a separate expert concern.

## 5. Proven Reference: Gutenberg, Adapted

The system should intentionally borrow Gutenberg's core model:

```txt
document = ordered tree of block instances
block type = registered capability
block instance = name + attrs + innerBlocks
editor = manipulates block instances
frontend = renders block instances
```

ConvexPress should adapt this model:

| Concern | Gutenberg | ConvexPress |
|---|---|---|
| Block identity | `blockName` like `core/paragraph` | `name` like `core/hero`, `commerce/pricing-table`, `local/dealer-map` |
| Attributes | JSON object | Typed `attrs` object validated by Zod and Convex envelope validators |
| Nested blocks | `innerBlocks` | `innerBlocks` with allowed-child rules |
| Storage | HTML comments in post content | Structured Convex data |
| Registration | PHP + JS registry | TypeScript registry in Admin and Website |
| Rendering | PHP render callback or saved HTML | React renderer, SSR-safe |
| Migrations | Deprecations/transforms | Versioned block migrations |
| AI extension | Not native | First-class via future `block-kit` |

The most important improvement is storage. ConvexPress stores clean structured data instead of HTML comment delimiters.

## 6. Product Experience

### 6.1 Pages

Pages default to block mode.

When a user creates a page, they see a block canvas with:

- Add block inserter
- Searchable block library
- Block categories
- Reorder controls
- Duplicate/delete controls
- Block settings panel
- Document settings panel
- Inline or panel-based block editing
- Preview states
- Unknown block fallback
- Real-time save status for every edit

The page still has normal WordPress-like page fields:

- Title
- Slug/path
- Parent page
- Menu order
- Status/visibility
- Featured image where supported
- SEO metadata
- Layout overrides
- Revisions

### 6.2 Posts

Posts default to article mode.

Article mode keeps:

- TipTap content
- Structured hero/topics/summary/sources/table of contents fields
- Existing AI generation flows
- Existing article renderers

Posts can opt into block mode through a deliberate conversion action:

> Convert this post to block mode

The first version should be one-way unless a future migration can prove reliable round-tripping.

### 6.3 AI Workflow

AI should be able to:

- Add and configure existing blocks on a page.
- Convert a page from legacy sections to blocks.
- Convert a post from article mode to blocks.
- Generate a new custom block type through a future skill.
- Audit block instances for missing renderers, invalid attrs, stale versions, and migration needs.

### 6.5 Real-Time Editing And Saving

The block editor should feel native to Convex: changes save immediately and propagate reactively.

Required behavior:

- Typing into a block updates local editor state immediately and persists through a short debounced Convex mutation.
- Structural actions save immediately: add block, remove block, duplicate block, move block, drag reorder, convert block, change layout, lock/unlock block.
- The UI uses optimistic updates so the canvas responds instantly.
- Every block instance can show save state when useful: saved, saving, offline, failed, or conflict.
- Page-level save state summarizes whether the document is fully synced.
- Reordering blocks should not wait for a manual "Update" click.
- Leaving the page with unsynced changes should warn the user.
- Offline or failed mutations keep local changes in memory and retry when possible.
- Reactive Convex subscriptions update other open sessions after saves land.

Manual Save/Update should remain for WordPress familiarity, status transitions, publish workflows, and explicit user confidence, but block content itself should not depend on that button to persist.

The target feel is:

```txt
edit block attrs -> optimistic local update -> debounced mutation -> Convex save -> reactive confirmation
move block       -> optimistic local reorder -> immediate mutation -> Convex save -> reactive confirmation
delete block     -> optimistic remove        -> immediate mutation -> Convex save -> reactive confirmation
```

### 6.4 User-Created Custom Blocks

Custom blocks are code-defined, not database-defined executable code.

AI creates files in the codebase that define:

- Block manifest
- Attribute schema
- Default attributes
- Admin editor UI
- Admin preview UI
- Website renderer
- Optional backend tables/functions if the block manages data
- Migrations
- Tests or verification fixtures where appropriate

The database only stores instances and attrs.

## 7. Content Modes

Add a content mode concept to `posts`.

```ts
type ContentMode = "article" | "blocks";
```

Rules:

- New pages default to `contentMode: "blocks"`.
- New posts default to `contentMode: "article"`.
- Existing records without `contentMode` are interpreted by type:
  - `type === "page"` -> legacy compatibility mode until migrated; UI should prompt to migrate.
  - `type === "post"` -> article mode.
- Block-mode records render from `blocks`.
- Article-mode posts render from current fields and TipTap content.

## 8. Block Instance Model

Canonical block instance:

```ts
export interface ConvexPressBlock {
  id: string;
  name: string;
  version: number;
  attrs: Record<string, unknown>;
  innerBlocks?: ConvexPressBlock[];
  layout?: BlockLayout;
  lock?: BlockLock;
}

export interface BlockLayout {
  tone?: "default" | "muted" | "accent" | "contrast";
  padding?: "compact" | "normal" | "spacious";
  container?: "content" | "wide" | "full";
  align?: "default" | "wide" | "full";
}

export interface BlockLock {
  move?: boolean;
  remove?: boolean;
  edit?: boolean;
}
```

Naming convention:

- Core platform blocks: `core/<block-name>`
- Commerce blocks: `commerce/<block-name>`
- Membership blocks: `membership/<block-name>`
- Support blocks: `support/<block-name>`
- Knowledge base blocks: `kb/<block-name>`
- Official extension blocks: `<extension-id>/<block-name>`
- Local user blocks: `local/<block-name>` or `local/<namespace>/<block-name>`

Examples:

```json
{
  "id": "blk_2pdc6t",
  "name": "core/pricing-cards",
  "version": 1,
  "attrs": {
    "eyebrow": "Pricing",
    "heading": "Plans for every stage",
    "plans": []
  },
  "layout": {
    "tone": "accent",
    "padding": "spacious",
    "container": "wide"
  }
}
```

## 9. Block Type Contract

Each block type has a code-defined contract.

```ts
export interface BlockManifest<TAttrs> {
  name: string;
  title: string;
  description: string;
  category: BlockCategory;
  keywords?: string[];
  icon: LucideIcon;
  version: number;
  supports: BlockSupports;
  defaultAttrs: TAttrs;
  schema: z.ZodType<TAttrs>;
  migrations?: Record<number, BlockMigration>;
  transforms?: BlockTransform[];
}
```

Admin contract:

```ts
export interface AdminBlockDefinition<TAttrs> {
  manifest: BlockManifest<TAttrs>;
  Editor: React.ComponentType<BlockEditorProps<TAttrs>>;
  Preview?: React.ComponentType<BlockPreviewProps<TAttrs>>;
}
```

Website contract:

```ts
export interface WebsiteBlockDefinition<TAttrs> {
  manifest: BlockManifest<TAttrs>;
  Renderer: React.ComponentType<BlockRendererProps<TAttrs>>;
}
```

Block supports:

```ts
export interface BlockSupports {
  reusable?: boolean;
  multiple?: boolean;
  innerBlocks?: boolean;
  allowedChildren?: string[];
  parent?: string[];
  layout?: boolean;
  align?: Array<"default" | "wide" | "full">;
  media?: boolean;
  html?: false;
}
```

## 10. Registry Architecture

### 10.1 Admin Registry

Admin registry responsibilities:

- Expose block inserter metadata.
- Validate attrs before save.
- Render editor controls.
- Render admin preview.
- Provide defaults.
- Run migrations when an instance is stale.

Recommended files:

```txt
ConvexPress-Admin/apps/web/src/lib/blocks/
  types.ts
  registry.ts
  validation.ts
  migration.ts
  serialization.ts

ConvexPress-Admin/apps/web/src/blocks/<block-id>/
  manifest.ts
  schema.ts
  editor.tsx
  preview.tsx
  index.ts
```

### 10.2 Website Registry

Website registry responsibilities:

- SSR-safe rendering.
- Runtime fallback for unknown/missing blocks.
- Normalize/migrate attrs before render where safe.
- Avoid admin-only dependencies.

Recommended files:

```txt
ConvexPress-Website/apps/web/src/lib/blocks/
  types.ts
  registry.ts
  renderer.tsx
  migration.ts
  validation.ts

ConvexPress-Website/apps/web/src/blocks/<block-id>/
  manifest.ts
  renderer.tsx
  index.ts
```

### 10.3 Discovery

Use static registries for Phase 1. Move to scanner-discovered blocks in Phase 2 or Phase 3, using the same philosophy as the Admin extension v2 system:

- Core blocks are tracked.
- Official extension blocks are tracked.
- Local blocks live under `.local` roots and are gitignored.
- Registry generation is additive.

Potential future roots:

```txt
apps/web/src/blocks/
apps/web/src/blocks.local/
```

## 11. Convex Data Model

### 11.1 Posts Table Additions

Add to `posts`:

```ts
contentMode: v.optional(v.union(
  v.literal("article"),
  v.literal("blocks"),
)),
blocks: v.optional(v.array(blockInstanceValidator)),
blocksVersion: v.optional(v.number()),
```

Keep existing fields:

- `content`
- `pageSections`
- `hero`
- `topics`
- `summary`
- `sources`
- `tableOfContents`
- `pagePrompt`

Reason: this is an expansion, not a destructive migration.

### 11.2 Block Envelope Validator

Convex should validate the universal envelope:

```ts
const blockLayoutValidator = v.object({
  tone: v.optional(v.union(
    v.literal("default"),
    v.literal("muted"),
    v.literal("accent"),
    v.literal("contrast"),
  )),
  padding: v.optional(v.union(
    v.literal("compact"),
    v.literal("normal"),
    v.literal("spacious"),
  )),
  container: v.optional(v.union(
    v.literal("content"),
    v.literal("wide"),
    v.literal("full"),
  )),
  align: v.optional(v.union(
    v.literal("default"),
    v.literal("wide"),
    v.literal("full"),
  )),
});
```

The `attrs` field may need to start as `v.any()` because custom block attrs vary by type. This must be wrapped in disciplined validation:

- Admin validates with the registered Zod schema before save.
- Website validates with the registered schema before render.
- Backend validates envelope and maximum size/depth.
- Future backend block registry can validate type-specific attrs for core blocks.

### 11.3 Limits

Initial hard limits:

- Max top-level blocks per post/page: 200
- Max nested depth: 4
- Max serialized blocks payload: define an explicit byte limit after measuring current Convex limits and app needs
- Max block `name`: 120 chars
- Max block `id`: 80 chars

These limits protect editor performance, Website SSR, and accidental AI over-generation.

## 12. Rendering Rules

Website rendering pipeline:

1. Page route loads page data.
2. If `contentMode === "blocks"`, render `blocks`.
3. Else if page has legacy `pageSections`, adapt and render through compatibility adapter.
4. Else render current template/content path.
5. Unknown block renders safe fallback.
6. Invalid attrs render safe fallback and log/audit in development.

Renderer contract:

- SSR-compatible.
- No browser-only APIs during server render.
- No admin imports.
- No `@radix-ui/*`.
- No hardcoded color literals.
- Use semantic HTML.
- Ensure one page-level `<h1>` unless the route/template owns the H1 strategy.
- Use CSS variables and Tailwind v4 tokens.
- Use existing media components for media IDs.

## 13. Editor Rules

Admin block editor must support:

- Add block
- Search block library
- Recently used blocks
- Block categories
- Reorder up/down
- Drag reorder later if stable
- Duplicate block
- Delete block with confirmation for complex blocks
- Edit attrs
- Edit layout settings
- Nested block editing for allowed parent blocks
- Keyboard navigation
- Selected block settings panel
- Document settings panel
- Unknown block warning
- Version migration prompt or automatic migration for safe migrations
- Real-time persistence for content and structure changes
- Optimistic updates with rollback or retry on mutation failure
- Clear page-level save status
- Per-block dirty/saving/error state where appropriate

No content-management modals. Destructive confirmations are allowed.

## 13.1 Real-Time Save Contract

ConvexPress blocks should use a granular live-save model rather than relying only on full-document form submission.

Recommended mutation surface:

```ts
blocks.updateBlockAttrs({
  postId,
  blockId,
  attrs,
  expectedRevision,
})

blocks.updateBlockLayout({
  postId,
  blockId,
  layout,
  expectedRevision,
})

blocks.insertBlock({
  postId,
  block,
  index,
  parentBlockId,
  expectedRevision,
})

blocks.moveBlock({
  postId,
  blockId,
  toIndex,
  fromParentBlockId,
  toParentBlockId,
  expectedRevision,
})

blocks.removeBlock({
  postId,
  blockId,
  expectedRevision,
})

blocks.replaceBlocks({
  postId,
  blocks,
  expectedRevision,
})
```

The exact function names can change during implementation, but the behavior must preserve these capabilities.

Real-time save rules:

- Text-like attrs should debounce briefly, around 300-800ms.
- Structural changes should save immediately.
- Mutations should patch the smallest reasonable portion of the block tree.
- Full-document replacement is allowed for conversion, migration, recovery, and bulk operations.
- Every mutation increments a document/block revision marker.
- Clients pass an `expectedRevision` when possible to detect stale writes.
- Conflict handling should prefer safe user-visible recovery over silent overwrite.

Conflict behavior:

- Same user, same tab: optimistic state is authoritative unless mutation fails.
- Same user, different tab: latest Convex update should reconcile if local tab is clean; warn if dirty.
- Different users: editor lock should warn, but if concurrent edits happen, conflicts should surface clearly.
- Stale structural edits should request reload/rebase instead of silently applying against the wrong tree.

Autosave terminology should still exist for article-mode TipTap content, but block mode should be described as live save or real-time save.

## 14. Relationship To TipTap

ConvexPress will have two block-like layers:

1. **Editorial blocks inside TipTap content**
   - Paragraphs, headings, lists, images, callouts, embeds.
   - Best for article bodies and rich text.
   - Stored in `posts.content`.

2. **Page composition blocks**
   - Hero sections, pricing, forms, galleries, feature grids, custom data widgets.
   - Best for page layout and functionality.
   - Stored in `posts.blocks`.

This PRD is primarily about page composition blocks.

TipTap remains valuable for rich text fields inside composition blocks. For example, a `core/rich-text` block may use TipTap internally for its body, but the block instance itself still has typed attrs.

## 15. Reusable Blocks And Patterns

There are two related concepts:

### 15.1 Reusable/Synced Blocks

Reusable blocks are content instances shared by reference.

Existing `reusableBlocks` can evolve or be complemented by a new typed reusable block model.

Desired future shape:

```ts
reusableBlocks: {
  title: string;
  slug?: string;
  block: ConvexPressBlock;
  status: "draft" | "publish";
  createdBy: Id<"users">;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}
```

### 15.2 Block Patterns

Patterns are starter compositions copied into a page.

Examples:

- SaaS landing page
- Service page
- Restaurant homepage
- Product launch page
- Webinar page
- Consultant about page

Patterns should be copied into the page, not synced, unless explicitly inserted as reusable blocks.

## 16. Shortcodes

Shortcodes can be supported as an optional compatibility/embedding layer, but they should not be the core architecture.

Recommended rule:

- Shortcodes resolve to registered block types or reusable blocks.
- Shortcodes are allowed inside rich text fields for placement convenience.
- Shortcodes never execute arbitrary code.

Example:

```txt
[block name="core/pricing-cards" reusable="pricing-main"]
```

This can be a later enhancement after the core block model is stable.

## 17. Core Block Library

The initial block library should be large enough to build real websites without custom block work.

### 17.1 Text And Editorial

- `core/rich-text`: rich content area, optionally TipTap-powered.
- `core/heading`: standalone heading with eyebrow/subtitle.
- `core/paragraph`: simple text block.
- `core/list`: ordered/unordered list.
- `core/quote`: quote or pull quote.
- `core/callout`: info, warning, success, error, note.
- `core/faq`: accordion FAQ.
- `core/table`: structured comparison/data table.
- `core/code`: code sample with language.
- `core/toc`: table of contents.
- `core/sources`: citations/source list.

### 17.2 Layout

- `core/group`: wrapper for child blocks.
- `core/columns`: column layout with child blocks.
- `core/grid`: responsive grid of child blocks.
- `core/stack`: vertical stack with spacing controls.
- `core/spacer`: vertical spacing.
- `core/divider`: divider line.
- `core/tabs`: tabbed content panels.
- `core/accordion`: accordion panels.
- `core/sidebar-layout`: main/sidebar content layout.

### 17.3 Hero And Marketing

- `core/hero`: standard hero with media and CTAs.
- `core/split-hero`: two-column hero.
- `core/video-hero`: hero with video/embed.
- `core/cta-band`: call-to-action band.
- `core/feature-grid`: feature cards.
- `core/feature-list`: icon/text feature list.
- `core/process-steps`: step-by-step process.
- `core/stats`: metrics/stat counters.
- `core/logo-cloud`: customer/partner logos.
- `core/testimonials`: testimonial cards/carousel.
- `core/comparison`: feature comparison table.
- `core/before-after`: before/after visual comparison.

### 17.4 Media

- `core/image`: single image with caption.
- `core/gallery`: image gallery grid.
- `core/carousel`: image/content carousel.
- `core/video`: video embed or uploaded video.
- `core/embed`: generic embed.
- `core/media-text`: media beside text.
- `core/image-hotspots`: image with labeled hotspots.
- `core/download`: downloadable file card.

### 17.5 Forms And Conversion

- `forms/contact-form`: contact form.
- `forms/newsletter-signup`: email signup form.
- `forms/lead-capture`: lead magnet form.
- `forms/appointment-request`: appointment/request form.
- `forms/quote-request`: quote request form.
- `forms/custom-form`: configured field list and submission target.

Forms likely need backend tables/functions for submissions. They should either be implemented as core backend support or as an official extension.

### 17.6 Commerce

- `commerce/product-grid`: product listing block.
- `commerce/featured-product`: single featured product.
- `commerce/category-grid`: product categories.
- `commerce/pricing-cards`: static or product-backed pricing cards.
- `commerce/bundle-promo`: product bundle promotion.
- `commerce/cart-cta`: cart/checkout CTA.
- `commerce/reviews`: product review summary/list.
- `commerce/wishlist-cta`: wishlist/share CTA.
- `commerce/subscription-plans`: subscription plan cards.

Commerce blocks should respect plugin enablement and render graceful fallbacks when commerce is disabled.

### 17.7 Membership And Account

- `membership/plan-cards`: membership plans.
- `membership/restricted-content`: gated block wrapper.
- `membership/signup-cta`: signup block.
- `membership/account-summary`: user account summary, dashboard-only where appropriate.
- `membership/downloads`: gated downloads list.

### 17.8 Knowledge Base And Support

- `kb/search`: knowledge base search box.
- `kb/article-list`: articles by category/collection.
- `kb/category-grid`: category cards.
- `kb/collection-list`: collection cards.
- `support/ticket-form`: support ticket creation form.
- `support/ticket-list`: customer ticket list, auth-gated.
- `support/deflection`: suggested articles before ticket creation.

### 17.9 Navigation And Site Data

- `site/breadcrumbs`: breadcrumb trail.
- `site/menu`: render a selected menu location.
- `site/social-links`: social links.
- `site/search`: site search form/results teaser.
- `site/recent-posts`: recent posts list.
- `site/category-list`: taxonomy category list.
- `site/author-card`: author bio card.

### 17.10 Maps And Local Business

- `local/map`: map embed or static map.
- `local/location-list`: locations directory.
- `local/hours`: business hours.
- `local/contact-card`: address/phone/email card.
- `local/service-area`: service area list/map.

### 17.11 Advanced Interactive Blocks

- `interactive/calculator`: configurable calculator shell.
- `interactive/filter-grid`: filterable cards/grid.
- `interactive/quiz`: quiz or assessment.
- `interactive/timeline`: chronological timeline.
- `interactive/countdown`: countdown timer.
- `interactive/booking-cta`: booking integration CTA.

These may need more careful capability and backend design.

## 18. AI Block Kit

Create a future `block-kit` after core architecture lands.

Recommended structure:

```txt
block-kit/
  README.md
  ARCHITECTURE.md
  CONTRACTS.md
  DATA-API.md
  WORKFLOW.md
  TROUBLESHOOTING.md
  references/
    manifest.example.ts
    schema.example.ts
    editor.example.tsx
    renderer.example.tsx
    migration.example.ts
    backend-table.example.ts
```

Skills:

- `block-build`: create a new block type.
- `block-add-feature`: extend an existing block.
- `block-audit`: verify block wiring, schemas, renderers, migrations.
- `block-migrate-page`: convert legacy sections or article content into blocks.
- `block-pattern-build`: create a reusable block pattern.

The skill contract must require:

- No arbitrary runtime code from database.
- Zod schema for attrs.
- Default attrs.
- Admin editor.
- Website renderer.
- Typecheck.
- SSR-safe rendering.
- Accessibility notes.
- Migration strategy when block attrs change.

## 19. Implementation Phases

### Phase 0: Planning And Inventory

Deliverables:

- This PRD.
- Audit current `pageSections`, `PageSectionsComposer`, `PageSectionStack`, page queries, and Website page route.
- Decide exact naming: `blocks` vs `compositionBlocks`.
- Decide whether block registries start static or scanner-generated.
- Create implementation checklist and acceptance criteria.

### Phase 1: Shared Types And Core Registry

Admin deliverables:

- `apps/web/src/lib/blocks/types.ts`
- `apps/web/src/lib/blocks/registry.ts`
- `apps/web/src/lib/blocks/validation.ts`
- Core block definitions for current section equivalents.

Website deliverables:

- Matching block types.
- Website renderer registry.
- Unknown block fallback.

Acceptance:

- Existing current section equivalents can be represented as `ConvexPressBlock`.
- No schema changes required yet.
- TypeScript compiles.

### Phase 2: Convex Schema And Mutations

Admin backend deliverables:

- Add `contentMode`, `blocks`, `blocksVersion` to `posts`.
- Add validators for block envelope.
- Update page create/update validators and mutations.
- Update post update validators and mutations for optional block mode.
- Preserve all existing fields.

Acceptance:

- New pages can save block arrays.
- Existing pages/posts still load.
- Typecheck passes.
- No deploy performed by implementation agent.

### Phase 3: Admin Page Block Editor

Deliverables:

- Block canvas component.
- Block inserter.
- Block instance shell.
- Block settings panel.
- Core block editors.
- Legacy `PageSectionsComposer` adapter or replacement.
- Page editor defaults new pages to block mode.

Acceptance:

- User can create a page with blocks.
- User can add/reorder/duplicate/delete blocks.
- User can edit attrs for each core block.
- User can save/update/publish page without losing existing metabox functionality.

### Phase 4: Website Block Renderer

Deliverables:

- `BlockRenderer` / `BlockListRenderer`.
- Core Website renderers.
- Legacy `pageSections` adapter.
- Page route chooses renderer by content mode.

Acceptance:

- Published block-mode pages SSR render correctly.
- Legacy pages still render.
- Existing page templates are not broken.
- Unknown blocks do not crash the page.

### Phase 5: Migration Tools

Deliverables:

- `pageSections` -> `blocks` converter.
- article fields -> blocks converter for post opt-in.
- admin action for "Convert to blocks".
- dry-run migration report.
- backfill script or mutation for selected records.

Acceptance:

- Existing pages can be migrated without data loss.
- Existing posts remain article mode unless explicitly converted.
- Conversion output is reviewable before save.

### Phase 6: Reusable Blocks And Patterns

Deliverables:

- Decide whether to evolve current `reusableBlocks` or add a new typed table.
- Synced block reference block.
- Pattern library.
- Insert pattern into page.
- Convert reusable block to regular blocks.

Acceptance:

- Reusable blocks update all references.
- Patterns copy into pages.
- Orphaned reusable references fail gracefully.

### Phase 7: Block Kit

Deliverables:

- `block-kit` 7-file scaffold.
- `block-build`, `block-add-feature`, `block-audit`, `block-migrate-page` skills.
- References for simple, nested, data-backed, and form blocks.

Acceptance:

- AI can create a new custom block following the kit.
- Generated block includes Admin editor and Website renderer.
- Typecheck passes.

### Phase 8: Advanced Core Blocks

Deliverables:

- Forms blocks.
- Commerce blocks.
- KB/support blocks.
- Membership blocks.
- Interactive blocks.

Acceptance:

- Blocks respect plugin enablement.
- Blocks with backend data use existing systems or clearly defined official extensions.
- Accessibility and SSR requirements pass.

## 20. Migration Strategy

Migration must be additive.

Current fields remain until all routes and admin workflows support blocks:

- `pageSections` stays readable.
- `content` stays readable.
- structured article fields stay readable.

Migration approach:

1. Add new fields.
2. Implement compatibility renderer.
3. Add manual per-page migration.
4. Add batch migration after confidence.
5. Keep fallback indefinitely or until a deliberate cleanup phase.

Mapping from current `pageSections`:

| Current Section | New Block |
|---|---|
| `hero` | `core/hero` |
| `feature-grid` | `core/feature-grid` |
| `story-split` | `core/media-text` or `core/story-split` |
| `pricing-cards` | `core/pricing-cards` or `commerce/pricing-cards` |
| `testimonial-band` | `core/testimonials` |
| `cta-band` | `core/cta-band` |
| `rich-text` | `core/rich-text` |

Mapping from article fields:

| Article Field | New Block |
|---|---|
| `hero` | `core/hero` |
| `topics[]` | `core/rich-text`, `core/media-text`, or `core/feature-list` |
| `summary` | `core/callout` or `core/rich-text` |
| `sources` | `core/sources` |
| `tableOfContents` | `core/toc` |
| `content` | `core/rich-text` |

## 21. Type Safety Requirements

- No untyped public APIs.
- No raw `Record<string, unknown>` in block editor components after schema parsing.
- Each block editor receives parsed typed attrs.
- Each block renderer receives parsed typed attrs.
- Zod schemas define attrs for every core block.
- Convex validators define the universal block envelope.
- Runtime parse failures produce typed fallback states, not crashes.
- Migrations convert old attrs into current attrs before editor/render use.

Acceptable temporary compromise:

- `attrs` may be stored as `v.any()` in Convex while block-specific validation lives in TypeScript registries.

Unacceptable:

- Saving arbitrary unvalidated attrs from admin UI.
- Website renderers assuming attrs shape without parsing.
- Database-stored executable code.

## 22. Security Requirements

- No executable code in block attrs.
- URL attrs sanitized before render.
- External links use safe `rel`.
- HTML block, if ever added, requires explicit `unfiltered_html` capability and sanitization.
- Forms must rate-limit or spam-protect submissions.
- Auth-gated blocks must check auth and capabilities through existing systems.
- Plugin-backed blocks must render disabled fallback if plugin is disabled.

## 23. Accessibility Requirements

- Block editor controls keyboard reachable.
- Block inserter searchable by keyboard.
- Reorder controls have labels.
- Interactive blocks use Base UI where appropriate.
- Frontend renderers use semantic HTML.
- Accordions/tabs/carousels meet ARIA expectations.
- Images require alt text or explicit decorative marking.
- Pages maintain a coherent heading hierarchy.
- Blocks should not create multiple page-level H1s unless explicitly configured by the route.

## 24. Performance Requirements

- Website block rendering must be SSR-safe.
- Avoid client-only data fetching for primary public content.
- Block editor should lazy-load heavy block editors where practical.
- Media blocks must use existing media/image sizing patterns.
- Nested block rendering must protect against excessive depth.
- Block registries should avoid importing admin-only editors into Website bundles.
- Live-save mutations must be debounced for high-frequency typing.
- Structural block mutations must remain small enough to keep drag/reorder interactions responsive.
- The editor should avoid rewriting the entire block document on every keystroke.
- Real-time subscriptions should not cause focused inputs to lose cursor position.

## 25. Verification Checklist

Before any implementation phase is considered complete:

- [ ] No existing content path was deleted.
- [ ] Existing posts still render.
- [ ] Existing pages still render.
- [ ] New pages default to block mode.
- [ ] New posts default to article mode.
- [ ] Block-mode posts can be saved and rendered.
- [ ] Block attrs are schema-validated before save and render.
- [ ] Typing in block fields persists through real-time Convex saves.
- [ ] Add/reorder/duplicate/delete block actions persist immediately.
- [ ] Save state is visible and accurate during live edits.
- [ ] Failed live saves are recoverable and do not lose local edits.
- [ ] Unknown blocks do not crash admin or Website.
- [ ] Website rendering is SSR-compatible.
- [ ] No `@radix-ui/*` imports.
- [ ] No hardcoded color literals in new UI.
- [ ] Typecheck passes in affected workspaces.
- [ ] No Convex deploy is run by the implementation agent.

## 26. Open Decisions

- Should the stored field be named `blocks`, `compositionBlocks`, or `pageBlocks`?
- Should core block registries be static first, or scanner-discovered from the start?
- Should reusable blocks evolve the current `reusableBlocks` table or use a new table for composition blocks?
- Should block patterns be stored in code, Convex, or both?
- How much block-specific validation should run in Convex initially?
- Should rich text inside composition blocks use TipTap JSON or simpler structured plain text fields?
- Should `pageTemplate` remain a layout selector after pages default to blocks, or become a compatibility field?

## 27. Recommended First Implementation Slice

Build the smallest complete vertical slice:

1. Add shared block types and static registries.
2. Add `contentMode` and `blocks` to `posts`.
3. Implement `core/hero`, `core/rich-text`, `core/feature-grid`, `core/cta-band`.
4. Add page block canvas in Admin.
5. Add Website block renderer.
6. Make new pages default to block mode.
7. Add compatibility adapter from `pageSections`.
8. Verify existing pages/posts still work.

This slice proves the architecture without trying to build the entire block universe in one pass.
