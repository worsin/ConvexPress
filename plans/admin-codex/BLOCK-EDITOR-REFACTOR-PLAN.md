# Block Editor Refactor Plan — AI-First, Skill-Driven Presentation

**Status:** Draft for Codex review
**Author:** Claude (refactor plan)
**Reviewer:** Codex (will critique and propose changes)
**Working mode:** Iterative — Codex audits → returns critique → we converge

---

## Executive summary

The current block editor (`apps/web/src/components/blocks/BlockCanvas.tsx` + `apps/web/src/lib/blocks/`) was built as a "Gutenberg-style" editor but the product vision is different: **the admin owns structure + content only; the front-end skill/theme owns all presentation.** This refactor strips the admin down to a clean AI-first content composer, deletes design controls from the back-end, expands the block library, and wires AI into the right surface.

The product positioning becomes: **"You type, AI designs."** Admin = structured outline. Front-end skill = beautiful render. AI generates the outline; humans polish via direct manipulation.

---

## Design principles (non-negotiable)

These are the rules every editor decision must obey. If a proposed change conflicts with one, the change is wrong.

1. **Admin shows ONLY content and structure.** No color pickers, font selectors, spacing sliders, alignment toggles, tone/padding/container selects, or any other "design" control anywhere in the back end.
2. **Front-end skill owns ALL presentation.** Colors, typography, spacing, alignment, responsiveness, animations, hover states, image treatments. All decided by the skill, applied consistently across every page.
3. **AI is the primary author.** Generate-from-prompt produces a sequence of blocks. The user's primary mental model is "I describe what I want, AI drafts, I polish."
4. **Humans polish via direct manipulation.** Drag to reorder. Click to edit. AI-regenerate one block without disrupting others. Insert between any two blocks. Type swap while keeping content. No re-prompt-the-whole-page-to-fix-one-thing.
5. **Block schemas are AI contracts.** Each block is a Zod schema with content-only fields. Tight constraints (min/max, url, enum) so AI produces valid output and humans get useful validation.
6. **Pages and posts use the same editor.** No article/blocks mode toggle. The block editor is THE editor. Marketing pages and blog posts both compose from the same block library — they just lean on different subsets.

---

## What stays / what goes

### Stays

- The blocks data model on `posts.blocks` with `blocksVersion` + `blocksRevision` for OCC.
- All backend mutations: `replaceBlocks`, `insertBlock`, `updateBlockAttrs`, `updateBlockLayout` (will be repurposed), `moveBlock`, `duplicateBlock`, `removeBlock`. Solid API surface for AI agents to call.
- The Zod-validated block envelope with `name/version/attrs` and the `validateBlocks` depth/count enforcement.
- The Website renderer pattern (`lib/blocks/registry.tsx` with `definition.Renderer`).
- TipTap and its extensions (kept in the package for potential future "rich-paragraph" block usage, NOT mounted in the editor surface).

### Goes (deletions in Phase 1)

- `BlockLayout { tone, padding, container, align }` — entire concept. Stripped from schemas, types, validators, UI, and Website renderer. Skill handles all of this.
- The `BlockLayoutControls` strip in `BlockCanvas.tsx` (the per-block tone/padding/container/select grid).
- The `updateBlockLayout` mutation (no longer needed — or repurposed to "block options" if useful, but probably just deleted).
- The article/blocks `contentMode` toggle in `EditorLayout.tsx`. The whole mode switcher and `switchToArticleMode`/`switchToBlockMode` callbacks.
- The structured AI sections in article mode (`HeroSectionEditor`, `TopicsListEditor`, `SummarySectionEditor`, `SourcesEditor`, `TableOfContentsEditor` — these were proto-AI patterns that get replaced by per-block AI in this refactor).
- `PageSectionsComposer.tsx` (the older page-builder predecessor). Migration converts existing data once, then this file is removed.
- `BlockSettingsPanel.tsx` (was dead code; replaced by inline expand-on-click block editing).

### Adds (across phases)

- Shared blocks package: `packages/blocks-shared/` (deduplicates Admin + Website).
- AI generation actions: page-level + per-block.
- Drag-and-drop reorder + insert-between affordances.
- Expanded block library (target 25+ blocks across content/marketing/commerce/site categories).
- Media picker + AI image generation integration.
- Skill catalog as a first-class concept the AI knows about.

---

## Phase 1 — Strip design controls; consolidate the blocks library

**Goal:** Smaller, cleaner data model. Single source of truth for schemas. No design controls in admin. Backward-compatible migration for existing data.

**Tasks:**

1. **Create `packages/blocks-shared/`** in the repo root or as a sibling to `packages/backend`. It exports:
   - `types.ts` — `ConvexPressBlock`, `BlockName`, `BlockCategory`, `BlockSupports`, validation result types. **Remove `BlockLayout` and `BlockLock` (lock can come back later if needed).**
   - `schemas.ts` — Zod schemas for each block. Tighten constraints: `.min(1).max(80)` on titles, `.url()` on URLs, `.enum([...])` where appropriate.
   - `registry-meta.ts` — `BLOCK_CATALOG` object keyed by block name. Each entry has: `name`, `title`, `description`, `category`, `keywords`, `version`, `schema`, `defaultAttrs`, **AI hints** (`useFor`, `avoid`, `examples`).
   - `validation.ts` — `validateBlockInstance`, `validateBlocks`, `normalizeBlocks`. Identical logic to today but operating on the leaner schema.
   - `page-sections.ts` — legacy migration helper (kept for one-time conversion only).

   Both `ConvexPress-Admin/apps/web/` and `ConvexPress-Website/apps/web/` import from `packages/blocks-shared/`. Delete the duplicated `lib/blocks/` folders in both apps after migration.

2. **Strip `layout` from the backend schema and helpers:**
   - `packages/backend/convex/schema/posts.ts` — remove `layout` field from the blocks envelope.
   - `packages/backend/convex/blocks/helpers.ts` — remove `BlockLayout` type, `updateBlockLayout` function, and the `layout` field from `StoredBlock`.
   - `packages/backend/convex/blocks/mutations.ts` — delete the `updateBlockLayout` mutation.
   - `packages/backend/convex/blocks/validators.ts` — delete `updateBlockLayoutArgs`.

3. **One-time migration** (`packages/backend/convex/blocks/migrations.ts`):
   - On read, strip `layout` from any existing block. Re-save on next mutation.
   - Or: write an internal action `migrateStripBlockLayout` that runs once across all posts/pages with non-empty `blocks` arrays.
   - Track via a settings flag `blocksLayoutStripped: true` so it only runs once.

4. **Update the admin BlockCanvas to remove the design controls:**
   - Delete `BlockLayoutControls` and `SelectControl` from `BlockCanvas.tsx`.
   - Delete the `handleLayoutChange` callback and `updateBlockLayoutMutation` reference.
   - Each block now renders ONLY its content fields (no layout strip below the title).

5. **Update the Website renderer to derive presentation from the skill:**
   - Delete the `layout.tone`/`layout.padding`/`layout.container` conditional classes in `BlockListRenderer.tsx`.
   - The skill's block-specific CSS / variants own all of this now.
   - Each block in the Website registry renders with whatever default look the skill provides.

6. **Tighten existing Zod schemas:**
   - `heroAttrsSchema.title` → `.min(1).max(80)`
   - `heroAttrsSchema.body` → `.min(1).max(500)`
   - `heroAttrsSchema.primaryCtaUrl` → `.url().or(z.literal(""))`
   - Repeat for `ctaBandAttrs`, `featureGridAttrs.items[].title`/`description`, `pricingCardsAttrs.plans[].price`, etc.
   - This serves AI (cleaner structured output contract) and humans (visible validation feedback).

**Out of scope for Phase 1:**
- Drag-and-drop (Phase 2).
- AI integration (Phase 4).
- New blocks (Phase 5).

**Done when:** existing pages still render, the layout strip is gone from every block in the admin, the Admin and Website both import from `packages/blocks-shared/`, and existing data has been migrated.

---

## Phase 2 — New admin editor shell (DnD, inline editing, insert-between)

**Goal:** The admin becomes a clean outline-style block list. Each block is a collapsed row that expands to show its content fields. Drag-and-drop reorder. "+" affordances between blocks. Per-block menu (move/duplicate/delete/swap type). No AI yet — that's Phase 4.

**Tasks:**

1. **Rewrite `BlockCanvas.tsx`** (or replace with a new `BlockOutline.tsx` and deprecate the old one):
   - Render blocks as a `SortableContext` from `@dnd-kit/sortable` (already installed).
   - Each block is a `SortableItem` row component with a left-edge drag handle.
   - Default state for each block: **collapsed** — shows type icon + title + one-line content preview + actions menu on hover.
   - Click row → expands inline to show content fields (the existing `definition.Editor` component).
   - Esc or click outside → collapses.
   - Use a single `selectedBlockId` state — only one block expanded at a time (Notion-style).

2. **Between-block insertion:**
   - Hover gap between rows → reveals a thin "+" button.
   - Click → opens a small inserter popover anchored to that gap.
   - Inserter has search + categorized block list (use the existing `BlockInserter.tsx` UI, adapted).
   - Selecting a block inserts at that exact position via `insertBlock` mutation with the correct `index`.

3. **Block actions menu:**
   - On hover, each block row reveals a `⋯` button at the right.
   - Menu items:
     - **Move up** / **Move down** (existing arrow logic — keep as keyboard shortcut alternative).
     - **Duplicate**.
     - **Delete**.
     - **Swap to…** — opens picker showing compatible block types; picking one preserves overlapping attrs (e.g. Hero→Media+Text keeps title/body/CTAs).
     - (AI actions added in Phase 4: Regenerate, Improve, Variants.)

4. **Keyboard shortcuts:**
   - `↑` / `↓` while no block expanded → navigate selection.
   - `Enter` on selected block → expand for editing.
   - `Esc` → collapse + return to navigation.
   - `Cmd+D` → duplicate selected.
   - `Backspace` or `Delete` (when selected, not editing) → delete with confirm.
   - `/` while focused on the canvas → open insert-block popover at end of list.

5. **One save path:**
   - Delete the per-attr debounced autosave AND the manual "Save blocks" button.
   - Replace with a single debounced save: 800ms after the last change, batch all pending ops into one mutation call.
   - Add a small save-status pill in the editor header: `Saved` / `Saving…` / `Unsaved` / `Conflict`.

6. **Conflict resolution UI:**
   - When `assertRevision` rejects, show a banner: "Someone else edited this page. \[View their changes\] \[Keep mine\] \[Discard mine\]".
   - "View their changes" → side-by-side diff modal.
   - "Keep mine" → re-fetch latest revision, re-apply local ops on top, send again.
   - "Discard mine" → re-fetch latest revision, throw away local changes.

7. **Block selection visualization:**
   - Selected block has a 2px primary-color outline.
   - Drag handle visible only on hover (or always on selected block).

8. **Remove the article/blocks mode UI but DON'T migrate data yet:**
   - In `EditorLayout.tsx`, keep `contentMode` field reading but force the editor surface to always render the block canvas.
   - Pages already default to blocks — no change visible there.
   - Posts that have `contentMode: "article"` need a runtime migration shown in Phase 3.

**Done when:** the page editor renders blocks as a clean drag-and-droppable outline with inline editing, no design controls, single autosave path, and conflict UI. Existing pages still work.

---

## Phase 3 — Unify pages and posts under one editor; migrate article content to blocks

**Goal:** Kill the article/blocks toggle entirely. Posts (currently TipTap article content) become blocks. One editor. Less code.

**Tasks:**

1. **Build a content-to-blocks converter:**
   - `packages/blocks-shared/src/migrations/tiptap-to-blocks.ts`.
   - Walks TipTap ProseMirror JSON and emits a `ConvexPressBlock[]`:
     - `paragraph` → `core/paragraph` block.
     - `heading` levels 1–6 → `core/heading` block with `level` attr.
     - `bulletList` / `orderedList` / `taskList` → `core/list` blocks.
     - `blockquote` → `core/quote`.
     - `codeBlock` with language → `core/code` with `language` attr.
     - `image` → `core/image` (will require media-row migration for src→mediaId — see Phase 6).
     - `embed` → `core/embed`.
     - `button` → `core/button`.
     - `callout` → `core/callout`.
     - `columns` / `column` → `core/columns` with `innerBlocks`.
     - `table` → `core/table`.
     - Inline marks (`bold`, `italic`, `link`, `code`, `highlight`) → stored as light markdown-ish inline syntax within paragraph body strings (`**bold**`, `*italic*`, `[link](url)`, etc.) OR as a structured `inlines` array per paragraph. **Decision needed — see Open Questions.**

2. **Run the migration when a post is opened in edit mode:**
   - If `contentMode === "article"` and `blocks` is empty, convert `content` → blocks, save via `replaceBlocks`, set `contentMode: "blocks"`.
   - Show a one-time banner: "Your post was converted to the new block editor. \[Learn more\]".
   - For posts where the conversion is lossy (custom TipTap nodes with no block equivalent), insert a placeholder block + log a warning.

3. **Strip the mode toggle from `EditorLayout.tsx`:**
   - Delete `switchToArticleMode`, `switchToBlockMode`, the toggle button, and the `contentMode` form field.
   - The `contentMode` DB field stays for now (for migration tracking) but is always set to `"blocks"` from this phase forward.
   - Delete the entire `{contentMode !== "blocks" && (...)}` branch — that's the structured AI sections, AI prompt textarea, and "Generate All with AI" button. These get replaced by Phase 4's better AI integration.

4. **Unmount TipTapEditor from the editor surface:**
   - `EditorLayout.tsx` no longer renders `<TipTapEditor>`.
   - `TipTapEditor.tsx`, `useContentEditor.ts`, `useEditorConfig.ts`, all extension files (`button-block.ts`, `callout-block.ts`, etc.), `BlockToolbar.tsx`, `LinkPopover.tsx`, `SlashCommandMenu.tsx`, `BlockInserter.tsx` — move to `apps/web/src/components/editor/_archived/` for one release cycle, then delete.
   - Exception: the slash command items registry (`slash-command-items.ts`) might be reused for the block-list insert popover — extract its useful parts into the new inserter.

5. **Delete dead code:**
   - `PageSectionsComposer.tsx` (the old composer).
   - The `pageSectionsToBlocks` migration runs once on the server for all posts with `pageSections`, then the field is removed from the schema.
   - `ContentEditorProvider.tsx` and `useContentEditor.ts` are TipTap-specific and unused after this phase.

**Done when:** `EditorLayout.tsx` has no `contentMode` toggle, no TipTap import, no article-mode UI. Both pages and posts open in the block outline editor. Existing TipTap content has been losslessly (or near-losslessly) converted to blocks on first edit.

---

## Phase 4 — AI integration (the big one)

**Goal:** Make AI the primary author. Page-level generation and per-block actions are the headline product features.

**Architecture:**

```
User prompt
    │
    ▼
Convex action (server)
    │
    ▼
LLM (Anthropic via tools, OpenAI via structured outputs, or Gemini)
    │  Inputs: block catalog, active skill metadata, page context,
    │          existing blocks (if editing), user prompt.
    │  Output: validated block array or single-block attrs.
    │
    ▼
Convex mutation (replaceBlocks / insertBlock / updateBlockAttrs)
    │
    ▼
BlockOutline re-renders via Convex subscription
```

**Tasks:**

1. **Build the AI block-context builder:**
   - `packages/backend/convex/blocks/ai/promptBuilder.ts`.
   - `buildBlockCatalogPrompt(catalog)` → a system prompt section enumerating every block name, description, when-to-use, when-to-avoid, JSON schema, and 1–2 example attrs.
   - `buildSkillContextPrompt(skill)` → a system prompt section about the active skill: name, vibe, tone, target audience, content density preference, block preferences (e.g. "this skill is best for marketing pages, prefers visual-heavy blocks").
   - `buildPageContextPrompt(page, existingBlocks?)` → page title, slug, current block tree (if editing), parent page (for context), categories/tags.

2. **Page-level generation action:**
   - `packages/backend/convex/blocks/ai/generatePage.ts`.
   - `generatePage` action with args `{ postId, prompt, pageType?: "landing" | "blog" | "product" | "about" | "free-form" }`.
   - Calls LLM with structured output = `z.array(blockEnvelope)`.
   - Streams blocks if the provider supports it (Anthropic message streaming + parsing). Each fully-formed block calls `insertBlock` so the user sees progressive construction.
   - If streaming not used, single `replaceBlocks` at the end.
   - Returns `{ blocksGenerated: number, tokensUsed: number, latencyMs: number }`.
   - Capability gated: `requireCan(ctx, "page.create" | "post.create")`.
   - Emits event `PAGE_AI_GENERATED` / `POST_AI_GENERATED` for the audit log.

3. **Per-block AI actions:**
   - `packages/backend/convex/blocks/ai/regenerateBlock.ts`:
     - `regenerateBlock(postId, blockId, refinement?: string)` → rewrites attrs for one block.
     - LLM input: block definition + current attrs + page context + refinement prompt.
     - LLM output: new attrs matching the block's Zod schema.
     - Calls `updateBlockAttrs`.
   - `improveBlock(postId, blockId, preset: "shorter" | "longer" | "formal" | "casual" | "technical" | "playful")` — same shape, preset becomes a prefix to the refinement prompt.
   - `generateVariants(postId, blockId, count: 3)` → returns N alternative attrs WITHOUT mutating. User picks one in the UI, then we call `updateBlockAttrs` with their choice.
   - `swapBlockType(postId, blockId, newBlockName)` → preserves overlapping content (title, body, CTAs) and asks LLM only for the fields the new type needs that the old type didn't have.

4. **Admin UI for AI actions:**
   - **Page-level:** prominent input + "✨ Generate page" button at the top of the editor, above the block list. Empty pages show it large; pages with content show it smaller / in a menu.
   - **Per-block:** each block row's actions menu (`⋯`) adds:
     - **✨ Regenerate** (with optional refinement textarea)
     - **Improve →** (submenu of presets)
     - **Variants** (modal showing 3 generated options + "Pick this one")
     - **Swap to…** (block-type picker with AI-assisted transform)
   - Show a small spinner per-block during regeneration. Block stays editable; once new attrs arrive, replace inline.

5. **AI sees the active skill:**
   - Theme/skill is a first-class entity (`themes.active` query). LLM prompt always includes skill name, description, and any per-block hints the skill exposes.
   - If a skill is built for "minimalist Apple-style", AI biases toward fewer blocks with more whitespace. If a skill is "data-dense SaaS landing page", AI biases toward feature-grids + comparison tables.

6. **Capabilities and gating:**
   - All AI actions require `requireCan(ctx, "post.update" | "page.update")` for editing existing content, and `requireCan(ctx, "post.create" | "page.create")` for generation from scratch.
   - Add an `ai.generate` capability for finer control (some roles might be allowed to edit but not AI-generate).
   - Track AI usage per-user via the existing audit-log system.

7. **Streaming and progress:**
   - For long pages, prefer streaming insert (better UX). Anthropic's message streaming + JSON-streaming parsing makes this feasible.
   - If the provider doesn't stream cleanly, fall back to one-shot `replaceBlocks` with a progress spinner.

**Done when:** users can type a prompt and get a full page of blocks generated. Each block has Regenerate/Improve/Variants/Swap actions in its menu. AI sees the active skill and adapts. Audit log captures usage.

---

## Phase 5 — Expand the block library

**Goal:** Cover the actual surface area users need. Today there are 8 marketing blocks (Hero/Rich-Text/Feature-Grid/CTA-Band/Media-Text/Testimonials/Pricing-Cards/FAQ). The target is ~30 blocks across 5 categories.

**Block development kit (set up before adding new blocks):**

1. **Block scaffolder script:** `bunx convexpress block:new <name> --category=<cat>`. Generates:
   - `packages/blocks-shared/src/blocks/<name>/schema.ts` — Zod schema + default attrs.
   - `packages/blocks-shared/src/blocks/<name>/meta.ts` — title, description, category, icon, AI hints.
   - `apps/admin/src/blocks/<name>/Editor.tsx` — content-fields-only editor.
   - `apps/website/src/blocks/<name>/Renderer.tsx` — the visual representation.
   - Test stub.
   - Auto-registers in the central registry.
2. **Every new block has:**
   - Zod schema (content fields only, no design fields).
   - Default attrs (good seeds for empty state).
   - AI hints (`useFor`, `avoid`, examples).
   - Admin Editor (just the form fields, no styling controls).
   - Website Renderer (uses the active skill's visual primitives).

**Target block library (Phase 5 ships in waves):**

### Wave A — Content blocks (essentials for blog posts)
- `core/paragraph` — body text with optional markdown emphasis.
- `core/heading` — h1–h4 with `level` attr.
- `core/list` — bullet / ordered / task variants.
- `core/image` — uses media library; alt, optional caption.
- `core/quote` — body, optional citation/source.
- `core/code` — language + content.
- `core/divider` — semantic, skill chooses visual style.
- `core/spacer` — semantic, skill chooses height.
- `core/embed` — URL with oEmbed lookup (YouTube/Vimeo/Twitter/TikTok/Loom/Spotify/CodePen/etc.).

### Wave B — Marketing additions
- `core/hero-text-only` — title + body, no media.
- `core/hero-split` — image on one side.
- `core/feature-list-alternating` — image left/right alternating per item.
- `core/logo-cloud` — brand logos band ("As seen on…").
- `core/stats-band` — "10,000 customers" stat cards.
- `core/team-grid` — photos + name + role + bio.
- `core/comparison-table` — vs competitors.
- `core/process-steps` — numbered step-by-step (onboarding, how-it-works).
- `core/roadmap-timeline` — upcoming/done items.
- `core/bento-grid` — modern asymmetric feature layout.

### Wave C — Forms and conversions
- `core/contact-form` — fields + submit handler.
- `core/newsletter-signup` — inline and large variants.
- `core/cta-band-with-form` — CTA + inline email capture.
- `core/booking-cta` — calendar embed or schedule link.

### Wave D — Site / discovery / commerce
- `core/latest-posts` — list of recent blog posts.
- `core/featured-products` — product grid (uses commerce data).
- `core/recipe-card` (already exists per project — wire it in).
- `core/product-showcase` — single product with details.
- `core/category-grid` — visual category browser.
- `core/author-bio` — author card with avatar + posts link.
- `core/social-links` — icon row.
- `core/tag-cloud`.

### Wave E — Layout containers
- `core/columns` — 2/3/4 column layout with `innerBlocks` per column.
- `core/group` — group of blocks (collapsible in admin, no visual container by default; skill decides).
- `core/accordion` — for FAQs and progressive disclosure.
- `core/tabs` — tabbed content.
- `core/carousel` — for testimonials / images.

**Sequencing:** Wave A is highest priority (unblocks blog posts after Phase 3 migration). Waves B–E can ship in any order based on user demand.

**Done when:** each wave's blocks have schema + admin editor + website renderer + AI hints, are registered in the central catalog, and AI can pick from them when generating pages.

---

## Phase 6 — Media and AI image generation

**Goal:** Kill the "Media ID" text input. Every image field has a proper picker. AI can generate images on demand.

**Tasks:**

1. **Reusable `<MediaField>` component:**
   - Replaces all `<TextField label="Media ID" .../>` instances in block editors.
   - Three modes accessible via tabs or buttons:
     - **📁 Library** — opens the existing media picker.
     - **⬆ Upload** — file input with drag-and-drop.
     - **✨ Generate** — opens an AI image generation panel.
   - Stores result as `mediaId: Id<"media">` on the block attrs.
   - Shows thumbnail preview inline.

2. **AI image generation action:**
   - `packages/backend/convex/media/ai/generate.ts`.
   - `generateImage` action with args `{ prompt, aspectRatio, style }`.
   - Calls image-gen provider (Replicate, OpenAI DALL-E 3, Imagen, or whatever's already configured).
   - Stores generated image in the media library with metadata: source=ai, prompt, model.
   - Returns `mediaId`.

3. **Auto-prompt suggestions:**
   - When generating for a hero block, pre-fill prompt from `attrs.title + attrs.body`.
   - When generating for a feature-grid card, pre-fill from item title + description.
   - User can edit prompt before generating.

4. **Image-gen during page generation:**
   - When `generatePage` action runs and produces blocks with image fields, optionally chain image generation for each one. Capability-gated and rate-limited (could be expensive).
   - Toggle in skill settings: "Auto-generate images for AI-created pages: on/off".

5. **Replace existing `MediaPicker.tsx`** — keep the picker logic, wrap it in the new tri-mode `<MediaField>` shell.

**Done when:** no block editor has a raw text input for media IDs. AI image generation works inline with text generation.

---

## Phase 7 — Polish, revisions, and admin DX

**Goal:** Tighten the loose ends. Revisions tracked. Outline view. Keyboard fluency.

**Tasks:**

1. **Block-aware revisions:**
   - Every `replaceBlocks` / `insertBlock` / `updateBlockAttrs` / `moveBlock` / `removeBlock` writes a row to the existing post-revisions table.
   - Revision row stores: pre/post block diff (use existing `lib/blockDiff.ts`), author, timestamp, action type.
   - Revisions metabox shows block-aware diff.
   - Restore-from-revision works for blocks.

2. **Outline / overview panel:**
   - Sidebar panel showing the block tree as a clickable outline.
   - Click → scroll to that block.
   - Drag in outline → reorder (mirrors canvas DnD).
   - Useful for long pages (20+ blocks).

3. **Block patterns / starter sections:**
   - Pre-built sequences ("Pricing page starter", "About page starter", "Recipe page starter") stored in Convex.
   - Surfaced in the inserter under "Patterns".
   - Each pattern is a small array of blocks with pre-filled attrs.

4. **Reusable blocks (the blocks-mode equivalent):**
   - User can save any block as a reusable block.
   - Stored in `reusableBlocks` table.
   - Surfaced in the inserter under "Reusable".
   - Insertion creates a copy (not a live link) for now — synced patterns can come later.

5. **Mobile preview iframe:**
   - Side panel iframe rendering the page at 375px width.
   - Updates live as blocks change.
   - Useful for spot-checking on mobile even though the skill handles responsive.

6. **Full a11y pass:**
   - Block list: `role="region"`, `aria-label`, focus management.
   - Drag-and-drop: keyboard alternative (Space to pick up, arrows to move, Space to drop).
   - Inserter: full keyboard navigation, `aria-activedescendant`.
   - Block menu: proper `role="menu"`, focus trap, Esc to close.

7. **Performance:**
   - Memoize each block row so a change in one block doesn't re-render all.
   - Lazy-load each block's Editor component (dynamic import per block name).
   - Cap `enableContentCheck` to dev only.

**Done when:** revisions capture block changes, outline panel ships, patterns and reusable blocks are surfaced, mobile preview works, a11y audit passes.

---

## Open questions for Codex

These are the decisions where I want a second opinion before locking in. Codex, please weigh in:

1. **Inline marks within paragraph blocks:** Markdown-ish strings (`**bold**`, `*italic*`, `[link](url)`) in a single body string, OR a structured `inlines: [{text, marks: ["bold"]}]` array? Markdown is friendlier for AI generation and human typing; structured is safer for skills to render. Recommendation?

2. **TipTap article mode preservation:** Plan says delete it after migrating data. Is there a use case (e.g. blog post authors who really want a single rich-text canvas) where keeping TipTap as a "free-form paragraph" block inside the new editor would be better than killing it entirely?

3. **Streaming for AI page generation:** Anthropic supports streaming with structured JSON, but parsing partial blocks reliably is non-trivial. Worth the effort for the UX, or ship one-shot first and add streaming later?

4. **Skill catalog as a first-class concept:** Today the skill/theme system exists but isn't deeply integrated. How far should the refactor push on making the active skill drive AI behavior? Bare minimum (skill name in prompt) vs. deep integration (skill exposes per-block hints, preferred blocks, tone)?

5. **Lock concept:** Plan removes `BlockLock { move, remove, edit }`. Is locking valuable for templates/patterns down the line, or is it premature abstraction we shouldn't bring back?

6. **Convex bandwidth cost:** Per-attr writes today, batched debounced save in Phase 2. Should we go further and use a CRDT (Yjs over Convex) for collaborative editing later? Out of scope for now but flag it.

7. **AI cost throttling:** Per-user rate limits, monthly token caps, fallback to a smaller model for "Improve" actions? How aggressive should the limits be by default?

---

## Acceptance criteria for the whole refactor

After all phases ship:

- The admin block editor has zero design controls (no tone/padding/container/align/color anywhere).
- Pages and posts open in the same editor. No mode toggle exists.
- Users can type a prompt, hit "Generate page," and get a full block tree with content filled in.
- Every block has Regenerate / Improve / Variants / Swap actions in its menu.
- Drag-and-drop reorder works. "+ Add block" between any two blocks works.
- Block library has 25+ blocks across content, marketing, forms, commerce, site, and layout categories.
- Image fields use a media picker with AI generation built in.
- Block edits write post-revisions with diffs.
- The blocks library is in `packages/blocks-shared/`, used by both Admin and Website.
- Front-end skill is the sole source of presentation; swapping skills changes the whole site visually with zero admin changes required.
- The product can honestly be pitched as "You type, AI designs."

---

## Suggested phase ordering for shipping

| Phase | Risk | Value | Ship order |
|---|---|---|---|
| 1 — Strip design controls, consolidate lib | Low | High (foundation) | 1st |
| 2 — New admin shell, DnD, inline editing | Medium | High (UX) | 2nd |
| 3 — Unify pages+posts, migrate TipTap | Medium | Medium (cleanup) | 3rd |
| 4 — AI integration | High | **Highest** (product feature) | 4th |
| 5A — Content blocks (paragraph/heading/list/etc) | Low | High (unblocks blog posts) | 5th |
| 5B–E — Marketing/forms/commerce/layout blocks | Low | Medium-high (incremental) | 6th onward |
| 6 — Media + AI image generation | Medium | High (closes the AI loop) | 7th |
| 7 — Revisions, outline, polish | Low | Medium (longevity) | 8th |

---

**Codex: review this plan. Push back on anything that feels wrong. Suggest improvements. Identify gaps. Specifically weigh in on the seven open questions above. Then we'll iterate.**
