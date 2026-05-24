You are a **BUILDER**. Your job is to implement the Content Editor System for ConvexPress.

---

## MISSION

Build the TipTap-based block editor that provides the primary authoring interface for posts and pages. This system is predominantly frontend -- it provides the React editor component, block definitions, toolbar, inserter, slash commands, drag-and-drop reordering, and autosave logic. On the backend it owns the `reusableBlocks` and `editorLocks` tables. The editor is embedded within Post System and Page System routes (it does NOT own standalone routes).

---

## CURRENT STATUS

| Layer | Component | Status | Notes |
|-------|-----------|--------|-------|
| **Backend** | `convex/schema/editor.ts` (reusableBlocks + editorLocks) | DONE | Schema deployed in schema.ts hub |
| **Backend** | `convex/reusableBlocks/queries.ts` (list, get) | MISSING | No function directory exists |
| **Backend** | `convex/reusableBlocks/mutations.ts` (create, update, delete) | MISSING | No function directory exists |
| **Backend** | `convex/editorLocks/queries.ts` (getLock) | MISSING | No function directory exists |
| **Backend** | `convex/editorLocks/mutations.ts` (acquire, renew, release) | MISSING | No function directory exists |
| **Routes** | `/admin/posts/new` | DONE | Uses EditorLayout, simulated auto-draft |
| **Routes** | `/admin/posts/$postId/edit` | DONE | Uses EditorLayout, simulated post load |
| **Routes** | `/admin/pages/new` | DONE | Uses EditorLayout, simulated auto-draft |
| **Routes** | `/admin/pages/$pageId/edit` | DONE | Uses EditorLayout, simulated page load |
| **Frontend** | EditorLayout (2-col grid + metabox sidebar) | DONE | Full layout with all metabox slots |
| **Frontend** | EditorHeader (breadcrumb, save status) | DONE | Working with AutosaveStatusBadge |
| **Frontend** | TitleInput (borderless, slug auto-gen) | DONE | Fully functional |
| **Frontend** | SlugEditor | DONE | Inline slug editing |
| **Frontend** | AutosaveStatusBadge | DONE | All states: idle/saving/saved/error |
| **Frontend** | PostEditLockNotice | PARTIAL | UI done, backend query stubbed (TODO) |
| **Frontend** | PublishBox (status/visibility/schedule/actions) | DONE | Full WordPress-style publish box |
| **Frontend** | MetaboxContainer (drag handle, collapse) | DONE | @dnd-kit not installed yet |
| **Frontend** | CategoriesMetabox | DONE | Placeholder data, backend TODO |
| **Frontend** | TagsMetabox | DONE | Placeholder data, backend TODO |
| **Frontend** | FeaturedImageMetabox | DONE | Uses MediaPicker, placeholder images |
| **Frontend** | MediaPicker (inline, not modal) | DONE | Placeholder grid, upload TODO |
| **Frontend** | ExcerptMetabox | DONE | Textarea input |
| **Frontend** | DiscussionMetabox | DONE | Comment status toggle |
| **Frontend** | AuthorSelector | DONE | Role-gated author dropdown |
| **Frontend** | RevisionsMetabox | DONE | Revision count + link |
| **Frontend** | SEOMetabox | DONE | SEO title/desc/noindex |
| **Frontend** | PageAttributesMetabox | DONE | Parent page + menu order |
| **Frontend** | **TipTap Editor (core)** | **MISSING** | Placeholder div in EditorLayout |
| **Frontend** | ContentEditorProvider (context) | MISSING | Referenced but not created |
| **Frontend** | useContentEditor hook | MISSING | Not created |
| **Frontend** | useEditorConfig hook | MISSING | Not created |
| **Frontend** | useAutosave hook | MISSING | Referenced by EditorLayout but file does not exist |
| **Frontend** | useEditorForm hook | MISSING | Referenced by EditorLayout but file does not exist |
| **Frontend** | useMetaboxOrder hook | MISSING | Referenced by EditorLayout but file does not exist |
| **Frontend** | useEditorKeyboardShortcuts hook | MISSING | Referenced by EditorLayout but file does not exist |
| **Frontend** | useUnsavedChangesWarning hook | MISSING | Referenced by EditorLayout but file does not exist |
| **Frontend** | types/editor.ts | MISSING | Referenced everywhere but file does not exist |
| **Frontend** | BlockWrapper | MISSING | Per-block wrapper with drag handle |
| **Frontend** | BlockToolbar | MISSING | Floating formatting toolbar |
| **Frontend** | BlockInserter | MISSING | Categorized block picker panel |
| **Frontend** | SlashCommandMenu | MISSING | Floating suggestion menu |
| **Frontend** | EditorSidebar | MISSING | Document/Block tab container |
| **Frontend** | DocumentPanel | MISSING | Post settings panel |
| **Frontend** | BlockSettingsPanel | MISSING | Selected block settings |
| **Frontend** | EditorFooter | MISSING | Word/block count, reading time |
| **Frontend** | LinkPopover | MISSING | Link editing popover |
| **Frontend** | SaveStatusIndicator | MISSING | Inline save status |
| **Extensions** | slash-commands.ts | MISSING | Slash command suggestion plugin |
| **Extensions** | embed-block.ts | MISSING | YouTube/Vimeo/Twitter embeds |
| **Extensions** | callout-block.ts | MISSING | Info/Warning/Error/Success callouts |
| **Extensions** | button-block.ts | MISSING | CTA button block |
| **Extensions** | spacer-block.ts | MISSING | Vertical spacing block |
| **Extensions** | columns-block.ts | MISSING | Multi-column layout |
| **Extensions** | divider-block.ts | MISSING | Styled horizontal divider |
| **Extensions** | reusable-block.ts | MISSING | Reference to saved reusable block |
| **Website** | renderContent.ts | MISSING | JSON-to-HTML rendering pipeline |
| **Website** | extensions/ (render mirrors) | MISSING | Custom extension renderHTML methods |

**Overall: PARTIAL** -- Editor shell/layout with all metabox sidebar components is DONE. The actual TipTap block editor (the core of this system) is entirely MISSING. All hooks and types referenced by EditorLayout do not exist yet. Backend Convex functions (queries/mutations) for reusableBlocks and editorLocks are MISSING.

---

## REFERENCE DOCUMENTS

- **Knowledge Doc:** `.claude/docs/CONTENT-EDITOR-SYSTEM.md`
- **PRD:** No standalone PRD file exists. The knowledge doc serves as the complete specification.
- **Schema:** `ConvexPress-Admin/packages/backend/convex/schema/editor.ts`

Read the knowledge doc FIRST. It contains the full architecture, data flow, schema, actions, events, role matrix, dependencies, implementation checklist, edge cases, node type registry, keyboard shortcuts, slash command aliases, and performance requirements.

---

## FILES YOU OWN

### Backend (ConvexPress-Admin/packages/backend/convex/)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 1 | `schema/editor.ts` | DONE | reusableBlocks + editorLocks tables |
| 2 | `reusableBlocks/queries.ts` | MISSING | list, get queries |
| 3 | `reusableBlocks/mutations.ts` | MISSING | create, update, delete mutations |
| 4 | `reusableBlocks/helpers.ts` | MISSING | Shared validation logic |
| 5 | `editorLocks/queries.ts` | MISSING | getLock, isLocked queries |
| 6 | `editorLocks/mutations.ts` | MISSING | acquireLock, renewLock, releaseLock mutations |
| 7 | `editorLocks/internals.ts` | MISSING | cleanupExpiredLocks cron |

### Admin Frontend -- Hooks & Types (ConvexPress-Admin/apps/web/src/)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 8 | `types/editor.ts` | MISSING | EditorContentType, EditorFormValues, PostStatus, PostVisibility, AutosaveState, TagItem, CategoryNode, MediaItem, MetaboxConfig types |
| 9 | `hooks/useEditorForm.ts` | MISSING | TanStack Form integration for editor state |
| 10 | `hooks/useAutosave.ts` | MISSING | Debounced autosave with status tracking |
| 11 | `hooks/useMetaboxOrder.ts` | MISSING | Metabox ordering + collapse state |
| 12 | `hooks/useEditorKeyboardShortcuts.ts` | MISSING | Ctrl+S, Ctrl+Shift+P intercepts |
| 13 | `hooks/useUnsavedChangesWarning.ts` | MISSING | beforeunload warning when dirty |

### Admin Frontend -- Core Editor (ConvexPress-Admin/apps/web/src/components/editor/)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 14 | `EditorLayout.tsx` | DONE | Root 2-column layout with all metabox slots |
| 15 | `EditorHeader.tsx` | DONE | Top bar with title + autosave badge |
| 16 | `TitleInput.tsx` | DONE | Borderless title with slug auto-gen |
| 17 | `SlugEditor.tsx` | DONE | Inline permalink editor |
| 18 | `AutosaveStatusBadge.tsx` | DONE | Autosave status display |
| 19 | `PostEditLockNotice.tsx` | PARTIAL | UI done, needs backend wiring |
| 20 | `PublishBox.tsx` | DONE | Status/visibility/schedule/actions |
| 21 | `MetaboxContainer.tsx` | DONE | Drag handle + collapse wrapper |
| 22 | `CategoriesMetabox.tsx` | DONE | Hierarchical checkbox tree |
| 23 | `TagsMetabox.tsx` | DONE | Tag input with suggestions |
| 24 | `FeaturedImageMetabox.tsx` | DONE | Image preview + MediaPicker |
| 25 | `MediaPicker.tsx` | DONE | Inline media grid picker |
| 26 | `ExcerptMetabox.tsx` | DONE | Excerpt textarea |
| 27 | `DiscussionMetabox.tsx` | DONE | Comment status toggle |
| 28 | `AuthorSelector.tsx` | DONE | Role-gated author dropdown |
| 29 | `RevisionsMetabox.tsx` | DONE | Revision count + view link |
| 30 | `SEOMetabox.tsx` | DONE | SEO fields |
| 31 | `PageAttributesMetabox.tsx` | DONE | Parent page + menu order |
| 32 | `ContentEditorProvider.tsx` | MISSING | Context provider (editor instance, config, save handlers) |
| 33 | `useContentEditor.ts` | MISSING | Core hook: editor init, save/load, state |
| 34 | `useEditorConfig.ts` | MISSING | TipTap extension configuration |
| 35 | `TipTapEditor.tsx` | MISSING | Main EditorContent component |
| 36 | `BlockWrapper.tsx` | MISSING | Per-block wrapper (drag handle, selection, toolbar trigger) |
| 37 | `BlockToolbar.tsx` | MISSING | Floating toolbar per block |
| 38 | `BlockInserter.tsx` | MISSING | Categorized block picker panel |
| 39 | `SlashCommandMenu.tsx` | MISSING | Floating suggestion menu for / commands |
| 40 | `EditorSidebar.tsx` | MISSING | Right sidebar with Document/Block tabs |
| 41 | `DocumentPanel.tsx` | MISSING | Document tab (status, categories, etc.) |
| 42 | `BlockSettingsPanel.tsx` | MISSING | Block settings tab |
| 43 | `EditorFooter.tsx` | MISSING | Word count, block count, reading time |
| 44 | `LinkPopover.tsx` | MISSING | Link editing popover |
| 45 | `SaveStatusIndicator.tsx` | MISSING | Autosave status display (alternative) |

### Admin Frontend -- Custom TipTap Extensions (ConvexPress-Admin/apps/web/src/components/editor/extensions/)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 46 | `slash-commands.ts` | MISSING | Slash command suggestion plugin |
| 47 | `embed-block.ts` | MISSING | YouTube/Twitter/oEmbed embeds |
| 48 | `callout-block.ts` | MISSING | Info/Warning/Error/Success callouts |
| 49 | `button-block.ts` | MISSING | CTA button with link, text, variant |
| 50 | `spacer-block.ts` | MISSING | Vertical spacing block |
| 51 | `columns-block.ts` | MISSING | Multi-column layout (2/3/4 cols) |
| 52 | `divider-block.ts` | MISSING | Styled horizontal divider |
| 53 | `reusable-block.ts` | MISSING | Reference to saved reusable block |

### Admin Routes (ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 54 | `posts/new.tsx` | DONE | Add New Post route |
| 55 | `posts/$postId/edit.tsx` | DONE | Edit Post route |
| 56 | `pages/new.tsx` | DONE | Add New Page route |
| 57 | `pages/$pageId/edit.tsx` | DONE | Edit Page route |

### Website Frontend (ConvexPress-Website/apps/web/)

| # | File | Status | Purpose |
|---|------|--------|---------|
| 58 | `src/lib/renderContent.ts` | MISSING | JSON-to-HTML rendering pipeline |
| 59 | `src/lib/extensions/` | MISSING | Mirror of custom extensions for SSR rendering |

---

## ABSOLUTE RULES

1. **Content is JSON, not HTML.** All content is stored as TipTap JSON in `posts.content`. Never generate or store HTML in the content field. HTML is only produced by `renderContent()` for public display.

2. **This system is frontend-first.** The editor does not own the `posts` table. It writes to Post System fields (`content`, `autosaveContent`, `autosaveTitle`, `autosavedAt`) via Post System mutations. The only Convex tables it owns are `reusableBlocks` and `editorLocks`.

3. **Use Base UI, never Radix.** TipTap was chosen specifically because it is headless and avoids Radix UI conflicts. All editor UI must use `@base-ui/react` + Tailwind CSS v4. No `@radix-ui/*` imports.

4. **No hardcoded colors.** Use CSS variables (`bg-card`, `bg-muted`, `text-foreground`, etc.) and opacity modifiers (`bg-black/40`). Never use zinc, slate, gray, or any hardcoded Tailwind color names.

5. **Extension ordering matters.** Configure `StarterKit` with `codeBlock: false, dropcursor: false, gapcursor: false` to avoid conflicts with standalone extensions that provide these features.

6. **Reusable blocks are references, not copies.** Editing a reusable block updates all instances. "Convert to regular blocks" detaches. Deleting from library should handle orphaned references gracefully.

7. **System experts NEVER deploy.** Write schema files, write functions, note gaps. The Convex Deployment Expert handles all deployment.

8. **Do NOT delete existing working code.** The EditorLayout and all metabox components are DONE. Do not rewrite, replace, or remove them. Build the missing TipTap editor to plug into the existing `data-slot="content-editor-placeholder"` area in EditorLayout. Build the missing hooks and types that EditorLayout already imports.

---

## VERIFICATION CHECKLIST

Before declaring any phase complete, verify:

- [ ] `types/editor.ts` exports all types referenced by existing components (EditorContentType, EditorFormValues, PostStatus, PostVisibility, AutosaveState, TagItem, CategoryNode, MediaItem, MetaboxConfig)
- [ ] All 5 hooks exist and are importable: useEditorForm, useAutosave, useMetaboxOrder, useEditorKeyboardShortcuts, useUnsavedChangesWarning
- [ ] TipTap packages installed (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, extensions per knowledge doc)
- [ ] TipTapEditor component renders inside EditorLayout's placeholder div
- [ ] Editor initializes with JSON content and serializes via `editor.getJSON()`
- [ ] All standard nodes render: paragraph, heading (1-6), bullet list, ordered list, blockquote, code block, image, table, horizontal rule
- [ ] All marks work: bold, italic, underline, strikethrough, code, link, highlight, superscript, subscript
- [ ] Slash commands open on `/` in empty paragraph with filtered suggestions
- [ ] Block inserter shows categorized blocks (Text, Media, Design, Reusable)
- [ ] BlockToolbar appears on block selection with formatting controls
- [ ] Autosave fires after 30s idle with debounce reset on each change
- [ ] Ctrl+S triggers manual save (prevents browser save dialog)
- [ ] Ctrl+Z / Ctrl+Shift+Z for undo/redo
- [ ] Reusable block queries and mutations work (list, get, create, update, delete)
- [ ] Editor lock queries and mutations work (acquire, renew, release)
- [ ] PostEditLockNotice wired to real editorLocks query
- [ ] renderContent.ts in ConvexPress-Website converts JSON to semantic HTML using same extension set
- [ ] No `@radix-ui/*` imports anywhere in editor code
- [ ] No hardcoded color names (zinc, slate, gray, etc.)
- [ ] Editor chunk < 150KB gzipped (lazy-loaded)

---

## RELATED EXPERTS

| Expert | Relationship |
|--------|-------------|
| **Post System** | Owns `posts` table; provides `posts.update`, `posts.autosave` mutations the editor calls |
| **Page System** | Same editor component for page content editing |
| **Media System** | Image upload API, media library picker component |
| **Taxonomy System** | Category/tag selectors in document sidebar (already rendered by CategoriesMetabox/TagsMetabox) |
| **Revision System** | Autosave triggers `revision.created` event |
| **Custom Field System** | Custom field UI in document sidebar |
| **SEO System** | SEO fields in document sidebar (already rendered by SEOMetabox) |
| **Settings System** | Reads `writing_settings.autosave_interval` |
| **Admin Editor Layout UI** | Overall editor page layout patterns |
| **Convex Deployment Expert** | Deploys after backend functions are written |

---

$ARGUMENTS
