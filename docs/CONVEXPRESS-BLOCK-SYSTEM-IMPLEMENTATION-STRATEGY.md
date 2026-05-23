# ConvexPress Block System Implementation Strategy

**Date:** 2026-05-20
**Related PRD:** `docs/CONVEXPRESS-BLOCK-SYSTEM-PRD.md`
**Goal:** Implement Gutenberg-inspired, Convex-native page composition blocks without deleting existing post/page functionality.

## 1. Strategy Summary

Build the block system as a series of narrow vertical slices. Each slice must compile, preserve existing posts/pages, and add one usable part of the new architecture.

The core rule:

> Add the new block system beside the current systems first, then migrate usage into it.

Do not start by replacing `pageSections`, `posts.content`, or the structured article fields. The first implementation should prove that a new page can be created, edited in block mode, live-saved through Convex, and rendered on the Website while old content continues to work.

## 2. Non-Negotiable Implementation Rules

- Do not delete existing fields or rendering paths.
- Do not remove `pageSections` until there is a proven compatibility adapter and migration path.
- Do not remove `hero`, `topics`, `summary`, `sources`, `tableOfContents`, or `pagePrompt`.
- Do not break TipTap article editing.
- Do not deploy Convex.
- Do not use `@radix-ui/*`.
- Do not add hardcoded color literals.
- Do not introduce arbitrary executable code in the database.
- Do not save unvalidated block attrs from Admin.
- Do not let Website renderers consume unparsed attrs.
- Do not rewrite the whole block document on every keystroke unless doing a bulk recovery/conversion action.

## 3. Workstream Boundaries

### Admin Backend

Owns:

- `posts` schema additions.
- Block envelope validators.
- Page/post mutations for block mode.
- Granular live-save mutations.
- Migration helpers.
- Event emission.

Does not own:

- Website rendering.
- Website route code.
- Deployment.

### Admin Frontend

Owns:

- Block editor canvas.
- Block inserter.
- Block settings.
- Block registry for Admin editors.
- Real-time save client behavior.
- Conversion UI.

Does not own:

- Public Website rendering.

### Website Frontend

Owns:

- Block render registry.
- SSR-safe block rendering.
- Legacy pageSections adapter rendering.
- Public fallbacks for unknown/invalid blocks.

Does not own:

- Convex schema/functions.
- Admin editor UI.

### Future Block Kit

Owns:

- AI workflows for creating/extending/auditing blocks.
- Standard file layout and contracts for custom blocks.

Does not start until the core architecture is proven.

## 4. Recommended Execution Order

### Phase A: Inventory And Stabilization

Purpose: avoid building against stale assumptions.

Tasks:

1. Re-read relevant repo instructions:
   - top-level `AGENTS.md`
   - `ConvexPress-Admin/AGENTS.md`
   - `ConvexPress-Website/AGENTS.md`
2. Re-read relevant experts/docs before changes:
   - content editor
   - page system
   - post system if post mutations are touched
   - website layout/page rendering
   - Convex tech expert if Convex API behavior is in question
3. Verify current state of:
   - `packages/backend/convex/schema/posts.ts`
   - `packages/backend/convex/pages/validators.ts`
   - `packages/backend/convex/pages/mutations.ts`
   - `packages/backend/convex/posts/validators.ts`
   - `packages/backend/convex/posts/mutations.ts`
   - `apps/web/src/components/editor/PageSectionsComposer.tsx`
   - `apps/web/src/lib/page-builder/templates.ts`
   - Website `PageRenderer`
   - Website `PageSectionStack`
   - Website page route
4. Run current typechecks before edits if practical:
   - `bun run check-types` in `ConvexPress-Admin`
   - `bun run check-types` in `ConvexPress-Website`

Exit criteria:

- Current relevant files are understood.
- Any existing typecheck failures are recorded separately from new work.
- No code changes yet except docs/checklists.

### Phase B: Shared Block Contracts

Purpose: create type-safe contracts before schema/UI work.

Admin files to add:

```txt
ConvexPress-Admin/apps/web/src/lib/blocks/types.ts
ConvexPress-Admin/apps/web/src/lib/blocks/schemas.ts
ConvexPress-Admin/apps/web/src/lib/blocks/registry.ts
ConvexPress-Admin/apps/web/src/lib/blocks/validation.ts
ConvexPress-Admin/apps/web/src/lib/blocks/migrations.ts
```

Website files to add:

```txt
ConvexPress-Website/apps/web/src/lib/blocks/types.ts
ConvexPress-Website/apps/web/src/lib/blocks/schemas.ts
ConvexPress-Website/apps/web/src/lib/blocks/registry.ts
ConvexPress-Website/apps/web/src/lib/blocks/validation.ts
ConvexPress-Website/apps/web/src/lib/blocks/migrations.ts
```

Initial block contracts:

- `core/hero`
- `core/rich-text`
- `core/feature-grid`
- `core/cta-band`

Implementation notes:

- Use Zod schemas for attrs.
- Keep attrs types inferred from schemas.
- Keep Admin and Website contracts intentionally parallel.
- Prefer duplicated minimal type contracts initially over a premature shared package. Extract a package later if drift becomes painful.
- Include unknown block and invalid block types.

Exit criteria:

- The initial core blocks can be represented as typed `ConvexPressBlock` instances.
- `validateBlockInstance` returns a typed success/failure result.
- Typecheck passes for files touched.

### Phase C: Backend Schema And Validator Expansion

Purpose: store blocks without disrupting existing content.

Schema additions in `posts`:

```ts
contentMode?: "article" | "blocks";
blocks?: ConvexPressBlock[];
blocksVersion?: number;
blocksRevision?: number;
```

Add backend validators for:

- block ID
- block name
- block layout
- block lock
- recursive block instance envelope
- max nested depth
- max top-level count

Update validators:

- page create/update args accept `contentMode`, `blocks`, `blocksVersion`, `blocksRevision` where appropriate.
- post update args accept block-mode fields where appropriate.

Important default behavior:

- Page create defaults `contentMode` to `"blocks"` once Admin UI is ready.
- Post create defaults `contentMode` to `"article"`.
- Existing records without `contentMode` continue to work.

Exit criteria:

- Schema compiles.
- Existing fields remain.
- Page/post mutations can accept but do not require blocks.
- No data migration is required yet.

### Phase D: Live-Save Backend Mutations

Purpose: make Convex real-time saving a foundation, not an afterthought.

Recommended function area:

```txt
ConvexPress-Admin/packages/backend/convex/blocks/
  validators.ts
  helpers.ts
  mutations.ts
  queries.ts
```

Initial mutations:

- `updateBlockAttrs`
- `updateBlockLayout`
- `insertBlock`
- `moveBlock`
- `duplicateBlock`
- `removeBlock`
- `replaceBlocks`

Mutation requirements:

- Use `requireCan` with page/post-aware capabilities.
- Verify target document exists.
- Verify caller can edit target document.
- Verify `contentMode === "blocks"` or allow conversion only through explicit `replaceBlocks`.
- Validate block envelope.
- Validate structural operations against current tree.
- Increment `blocksRevision`.
- Set `updatedAt`.
- Emit appropriate events through existing event helpers.
- Return updated revision and optionally updated blocks.

Revision strategy:

- Store `blocksRevision` on the post/page.
- Mutations accept optional `expectedRevision`.
- If stale, return a typed conflict error.
- Client decides whether to refetch/rebase or show conflict UI.

Save frequency rules:

- Text attr changes debounce in the client.
- Structural changes call immediately.
- Bulk conversion uses `replaceBlocks`.

Exit criteria:

- Mutations pass typecheck.
- Unit-like helper tests are added if existing test patterns support it.
- No full-document rewrite is needed for normal typing.

### Phase E: Admin Block Editor Vertical Slice

Purpose: make a page editable in block mode.

Files to add:

```txt
ConvexPress-Admin/apps/web/src/components/blocks/BlockCanvas.tsx
ConvexPress-Admin/apps/web/src/components/blocks/BlockInserter.tsx
ConvexPress-Admin/apps/web/src/components/blocks/BlockInstanceShell.tsx
ConvexPress-Admin/apps/web/src/components/blocks/BlockSettingsPanel.tsx
ConvexPress-Admin/apps/web/src/components/blocks/BlockSaveStatus.tsx
ConvexPress-Admin/apps/web/src/components/blocks/UnknownBlockEditor.tsx
ConvexPress-Admin/apps/web/src/components/blocks/InvalidBlockEditor.tsx
```

Initial block editors:

```txt
ConvexPress-Admin/apps/web/src/blocks/core/hero/
ConvexPress-Admin/apps/web/src/blocks/core/rich-text/
ConvexPress-Admin/apps/web/src/blocks/core/feature-grid/
ConvexPress-Admin/apps/web/src/blocks/core/cta-band/
```

Behavior:

- Add block.
- Edit attrs.
- Reorder block.
- Duplicate block.
- Delete block.
- Edit layout.
- Show live save state.
- Keep local optimistic state.
- Retry failed saves.
- Do not interrupt input cursor position when Convex data refreshes.

Integration:

- Page editor uses BlockCanvas for block-mode pages.
- Page editor keeps existing metaboxes.
- Existing content/page sections remain accessible for legacy pages.
- Post editor gets a visible but gated conversion path later; do not force post block editing yet.

Exit criteria:

- A new page can be composed from initial blocks.
- Changes persist without manual save.
- Manual Update/Publish still works.
- Existing page editor fields still work.

### Phase F: Website Rendering Vertical Slice

Purpose: render block-mode pages publicly.

Files to add:

```txt
ConvexPress-Website/apps/web/src/components/blocks/BlockListRenderer.tsx
ConvexPress-Website/apps/web/src/components/blocks/BlockRenderer.tsx
ConvexPress-Website/apps/web/src/components/blocks/UnknownBlock.tsx
ConvexPress-Website/apps/web/src/components/blocks/InvalidBlock.tsx
```

Initial renderers:

```txt
ConvexPress-Website/apps/web/src/blocks/core/hero/
ConvexPress-Website/apps/web/src/blocks/core/rich-text/
ConvexPress-Website/apps/web/src/blocks/core/feature-grid/
ConvexPress-Website/apps/web/src/blocks/core/cta-band/
```

Integration:

- Website `PageRenderer` detects `contentMode === "blocks"`.
- Block-mode pages render block list.
- Legacy `pageSections` adapter stays available.
- Existing templates still render for non-block pages.

Exit criteria:

- Published block-mode page SSR renders.
- Legacy pages render as before.
- Unknown/invalid block cannot crash page.
- Typecheck passes.

### Phase G: Page Default And Compatibility Adapter

Purpose: make pages block-first without breaking old pages.

Tasks:

- New page create path initializes:
  - `contentMode: "blocks"`
  - `blocks: [default starter blocks]` or `[]`, based on UX decision
  - `blocksRevision: 1`
- Existing page with `pageSections` can adapt to blocks in memory.
- Existing page with content-only mode still renders content.
- Admin shows migration prompt for legacy pages.

Exit criteria:

- New pages are block mode by default.
- Old pages do not require immediate migration.
- Old page sections can be previewed/rendered through compatibility.

### Phase H: Conversion And Migration

Purpose: provide explicit safe conversion.

Converters:

- `pageSectionsToBlocks`
- `articleFieldsToBlocks`
- `tipTapContentToRichTextBlock` where appropriate

Admin actions:

- Convert page sections to blocks.
- Convert post article mode to blocks.
- Preview conversion output before applying.
- Apply conversion with `replaceBlocks`.

Exit criteria:

- Conversion does not delete source fields.
- Converted result is saved in `blocks`.
- Original fields remain for rollback/reference.
- Conversion can be audited.

### Phase I: Core Block Expansion

Purpose: broaden usefulness after the foundation works.

Recommended expansion order:

1. `core/media-text`
2. `core/testimonials`
3. `core/pricing-cards`
4. `core/faq`
5. `core/gallery`
6. `core/tabs`
7. `core/accordion`
8. `core/stats`
9. `site/recent-posts`
10. `forms/contact-form`

Only build blocks once the base editor/render/save loop is proven.

Exit criteria:

- Each block has schema, defaults, Admin editor, Website renderer, and validation.
- Each block is included in inserter categories.
- Each block has fallback behavior.

### Phase J: Block Kit

Purpose: make block creation AI-native.

Create:

```txt
ConvexPress-Admin/block-kit/ or top-level block-kit/
  README.md
  ARCHITECTURE.md
  CONTRACTS.md
  DATA-API.md
  WORKFLOW.md
  TROUBLESHOOTING.md
  references/
```

Skills:

- `block-build`
- `block-add-feature`
- `block-audit`
- `block-migrate-page`
- `block-pattern-build`

Exit criteria:

- AI can create a simple block end to end.
- AI can create a data-backed block with clear backend boundaries.
- Generated blocks follow type safety and live-save requirements.

## 5. Live Save Client Strategy

The client should maintain a local block tree as the editing source of truth while mutations are pending.

Recommended state per block:

```ts
type BlockSaveState =
  | { status: "saved"; revision: number }
  | { status: "dirty" }
  | { status: "saving"; operationId: string }
  | { status: "failed"; operationId: string; message: string }
  | { status: "conflict"; serverRevision: number };
```

Operation behavior:

- Text/field edits:
  - update local attrs immediately
  - mark dirty
  - debounce mutation
  - mark saving
  - mark saved or failed
- Structural edits:
  - update local tree immediately
  - call mutation immediately
  - mark page saving
  - reconcile revision on success
- Convex subscription update:
  - if local clean, accept server state
  - if local dirty/saving, do not clobber focused input
  - if conflict, show recovery controls

Debounce defaults:

- Text fields: 500ms
- Rich text fields inside blocks: 750ms
- Sliders/toggles/selects: 250-500ms or on commit
- Structural changes: immediate

## 6. Verification Gates

Every phase must run the narrowest useful checks.

Admin checks:

```bash
bun run check-types
```

Website checks:

```bash
bun run check-types
```

Targeted searches:

```bash
rg '@radix-ui' ConvexPress-Admin/apps/web/src ConvexPress-Website/apps/web/src
rg 'bg-(zinc|slate|gray)|text-(zinc|slate|gray)|border-(zinc|slate|gray)' ConvexPress-Admin/apps/web/src ConvexPress-Website/apps/web/src
```

Functional checks once UI exists:

- Create page.
- Add hero block.
- Type heading and confirm live save.
- Reorder blocks and confirm live save.
- Refresh page and confirm block order/content persists.
- Publish page.
- View Website page.
- Confirm legacy page still renders.
- Confirm legacy post still renders.

## 7. Risk Controls

### Risk: Schema Field Expansion Breaks Existing Queries

Control:

- Add optional fields only.
- Preserve existing default assumptions.
- Keep compatibility adapters.

### Risk: Live Save Clobbers User Input

Control:

- Local optimistic state remains source of truth while dirty.
- Convex subscription updates do not overwrite focused dirty controls.
- Use revisions and operation IDs.

### Risk: Blocks Become Untyped JSON

Control:

- Zod schemas for every block.
- Typed editors/renderers receive parsed attrs.
- Invalid attrs render fallback.

### Risk: Too Much At Once

Control:

- Start with four core blocks only.
- Finish the full loop before expanding the library.

### Risk: Page Builder Complexity

Control:

- Constrain layout controls.
- Use nested blocks only for group/columns/tabs/accordion-like blocks.
- Avoid arbitrary per-block CSS.

### Risk: Website Bundle Bloat

Control:

- Separate Admin editors from Website renderers.
- Avoid importing Admin registries into Website.
- Lazy-load heavy blocks later.

## 8. First Vertical Slice Checklist

The first implementation pass is complete only when all are true:

- [ ] Block types and validators exist in Admin.
- [ ] Block types and validators exist in Website.
- [ ] `posts` supports optional `contentMode`, `blocks`, `blocksVersion`, `blocksRevision`.
- [ ] Block live-save mutations exist.
- [ ] Admin page editor can add/edit/reorder/delete four initial blocks.
- [ ] Block edits persist through Convex without manual save.
- [ ] Website renders block-mode pages.
- [ ] Legacy `pageSections` pages still render.
- [ ] Existing article-mode posts still render.
- [ ] Admin typecheck passes or pre-existing failures are documented.
- [ ] Website typecheck passes or pre-existing failures are documented.

## 9. Recommended First Blocks

Start with these because they map directly to existing `pageSections` and prove the architecture:

- `core/hero`
- `core/rich-text`
- `core/feature-grid`
- `core/cta-band`

Then add:

- `core/media-text`
- `core/testimonials`
- `core/pricing-cards`
- `core/faq`

Do not start with forms, commerce, or highly interactive blocks. Those should use the proven block infrastructure after it exists.

## 10. Handoff Notes For Future Implementers

Before coding, read:

- `docs/CONVEXPRESS-BLOCK-SYSTEM-PRD.md`
- this implementation strategy
- `ConvexPress-Admin/AGENTS.md`
- `ConvexPress-Website/AGENTS.md`
- relevant `.codex/agents/experts/*` and `.codex/docs/*`

When implementation starts, update this strategy with:

- chosen field names
- actual mutation names
- actual file paths
- known typecheck baseline
- completed phases
- deviations and why

