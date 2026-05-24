# Content Editor System - Expert Knowledge Document

**System:** Content Editor System
**Status:** Complete (100%)
**Priority:** P1 - High
**WordPress Equivalent:** Gutenberg Block Editor (Block Editor Framework)
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Content Editor System is ConvexPress's block-based rich text editor, equivalent to WordPress's Gutenberg editor. It provides the primary authoring interface embedded within the Post System's "Add New Post" / "Edit Post" screens and the Page System's "Add New Page" / "Edit Page" screens. Users compose content by assembling, configuring, and reordering discrete blocks (paragraphs, headings, images, lists, embeds, etc.) within a visual editor powered by TipTap (ProseMirror-based).

This system is **frontend-only** -- it provides the React editor component, block definitions, block toolbar, block inserter, slash commands, drag-and-drop reordering, and autosave logic. It does not own the `posts` table; it writes to `posts.content` and `posts.autosaveContent` fields owned by the Post System. It owns one table: `reusableBlocks`.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **TipTap** | ProseMirror-based headless editor framework (chosen over Plate to avoid Radix UI conflict) |
| **Block** | A discrete content unit (paragraph, heading, image, etc.) represented as a TipTap Node extension |
| **Mark** | Inline formatting applied to text within a block (bold, italic, link, highlight) |
| **JSON Document** | Content stored as structured JSON (TipTap document format), NOT HTML like WordPress |
| **Block Inserter** | UI panel for adding new blocks (+ button, categorized list, search) |
| **Slash Commands** | Typing `/` in an empty paragraph opens a filtered block suggestion menu |
| **Autosave** | Debounced (30s default) mutation writing to `posts.autosaveContent` |
| **Reusable Block** | Saved block(s) that can be inserted by reference across multiple posts |
| **Block Toolbar** | Floating toolbar above selected block with formatting and block-type controls |
| **Block Wrapper** | Per-block wrapper component providing drag handle, selection indicator, toolbar trigger |

### ConvexPress vs WordPress

| Aspect | WordPress Gutenberg | ConvexPress Content Editor |
|--------|--------------------|-----------------------------|
| **Editor framework** | Custom React block framework (`@wordpress/blocks`) | TipTap v2 (ProseMirror-based, headless) |
| **Content storage** | HTML with block comment delimiters (`<!-- wp:paragraph -->`) | Structured JSON (TipTap document format) |
| **Block registry** | PHP `register_block_type()` + JS `registerBlockType()` | TypeScript TipTap extension registry |
| **Reusable blocks** | `wp_block` post type | `reusableBlocks` Convex table |
| **Autosave** | AJAX POST to `admin-ajax.php` every 60s | Convex mutation with debounce (30s default) |
| **Block settings** | Sidebar panel per block | Inline popover + sidebar panel |
| **Slash commands** | `/heading`, `/image`, etc. | Same pattern via TipTap suggestion plugin |
| **Drag-and-drop** | Block mover arrows + drag handle | Native drag handle + drop indicator |
| **Code editor mode** | Raw HTML toggle | Raw JSON toggle (developer mode) |
| **UI library** | WordPress React components | Base UI + Tailwind (no Radix) |

---

## Architecture Overview

### Data Flow

```
User types/edits content in TipTap editor
  -> Editor state updated in ProseMirror document model (in-memory)
  -> On change: isDirty flag set, debounce timer reset
  -> After 30s idle: editor.getJSON() -> JSON.stringify()
     -> Call posts.autosave mutation (Post System)
     -> Writes to posts.autosaveContent, posts.autosaveTitle, posts.autosavedAt
     -> Emits revision.created event (Revision System)
  -> On manual "Save Draft" / "Update":
     -> editor.getJSON() -> JSON.stringify()
     -> Call posts.update mutation (Post System)
     -> Clears autosave fields
     -> Emits post.updated event
  -> On page load:
     -> posts.get query returns post with content JSON
     -> JSON.parse() -> editor.setContent()
     -> If autosaveContent is newer than content, show recovery dialog
```

### Real-Time Behavior

- **Autosave status indicator** updates reactively: "Saved" / "Unsaved changes" / "Saving..." / "Autosaved at {time}" / "Error"
- **Reusable blocks list** in the block inserter updates in real-time via Convex subscription to `reusableBlocks` query
- **Document sidebar fields** (status, categories, tags) update reactively through their owning systems' Convex subscriptions
- **Concurrent edit detection**: Post System's `_edit_lock` meta prevents data loss when multiple users open the same post

### Authentication & Authorization

Authentication is handled by the auth system. The Content Editor itself does not perform auth checks -- it relies on the Post System and Page System routes to gate access. However, the editor conditionally enables features based on capabilities:

| Capability | Effect on Editor |
|-----------|-----------------|
| `edit_posts` | Can open and use the editor at all |
| `upload_files` | Can insert media via image blocks (upload, media library picker) |
| `edit_others_posts` | Can edit content of posts authored by other users |
| `unfiltered_html` | Reserved for future Custom HTML block (not in v1) |

Reusable block creation requires **Administrator** or **Editor** role. Authors and Contributors cannot create reusable blocks but can insert existing ones.

---

## Database Schema

### `reusableBlocks` Table

This is the only table owned by the Content Editor System. It stores saved block configurations that can be referenced across multiple posts.

```typescript
// convex/schema.ts (addition to ConvexPress-Admin/packages/backend/)

reusableBlocks: defineTable({
  title: v.string(),                          // Display name for the reusable block
  content: v.string(),                        // Serialized JSON (same format as post content)
  authorId: v.string(),                       // user identifier of creator
  isPublished: v.boolean(),                   // Whether available for use in block inserter
  usageCount: v.number(),                     // How many posts reference this block (denormalized)
  createdAt: v.number(),                      // Creation timestamp (ms)
  updatedAt: v.number(),                      // Last modification timestamp (ms)
})
  .index("by_author", ["authorId"])
  .index("by_published", ["isPublished"])
  .index("by_title", ["title"]),
```

### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `title` | `string` | Yes | -- | Max 200 chars. Must be non-empty. Trimmed whitespace. |
| `content` | `string` | Yes | -- | Valid TipTap JSON document. Must parse without error. |
| `authorId` | `string` | Yes | Current user | Valid user identifier |
| `isPublished` | `boolean` | Yes | `true` | -- |
| `usageCount` | `number` | Yes | `0` | Non-negative integer. Updated when posts add/remove references. |
| `createdAt` | `number` | Yes | `Date.now()` | Unix timestamp (ms) |
| `updatedAt` | `number` | Yes | `Date.now()` | Unix timestamp (ms). Updated on every edit. |

### Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_author` | `["authorId"]` | Filter reusable blocks by creator |
| `by_published` | `["isPublished"]` | List only published (available) blocks in the inserter |
| `by_title` | `["title"]` | Search/sort reusable blocks by name |

### Relationships

| Related Table | Relationship | Description |
|--------------|-------------|-------------|
| `posts` (Post System) | Writer | Writes to `posts.content`, `posts.autosaveContent`, `posts.autosaveTitle`, `posts.autosavedAt` |
| `media` (Media System) | Consumer | Uses media picker for image block insertion |
| `revisions` (Revision System) | Trigger | Autosave triggers `revision.created` event |
| `settings` (Settings System) | Reader | Reads `writing_settings.autosave_interval` |

### Fields Used on Post System's `posts` Table (NOT owned)

These fields on the `posts` table are written to by the Content Editor but owned by the Post System:

| Field | Type | Purpose |
|-------|------|---------|
| `content` | `v.string()` | Serialized TipTap JSON document (full saved content) |
| `autosaveContent` | `v.optional(v.string())` | Last autosaved content (not yet manually saved) |
| `autosaveTitle` | `v.optional(v.string())` | Last autosaved title |
| `autosavedAt` | `v.optional(v.number())` | When autosave last ran |

---

## Actions & Functions

### Mutations

#### `editor.autosave` - Autosave Content

- **Airtable Record:** `recjMHzWHNEooU9S6`
- **Type:** Client-initiated Convex mutation (debounced)
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    autosaveContent: v.string(),    // JSON.stringify(editor.getJSON())
    autosaveTitle: v.string(),      // Current title value
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. On every content change in the editor, reset a debounce timer (default: 30 seconds, configurable via `writing_settings.autosave_interval`)
  2. When the timer fires, serialize the current editor state via `editor.getJSON()`
  3. Call the Post System's `posts.autosave` mutation with postId, autosaveContent, autosaveTitle
  4. The mutation writes to `posts.autosaveContent`, `posts.autosaveTitle`, and `posts.autosavedAt`
  5. Show autosave status indicator in the editor toolbar
  6. Emit `revision.created` event (via Revision System) if autosave content differs significantly from last save
- **Events:** `revision.created`
- **Errors:**
  - Network failure: Status changes to "Autosave failed -- click to retry". Content preserved in-memory.
  - Permission denied: Should not occur (checked at route level), but show error toast.

**Autosave indicator states:**

| State | Display | Description |
|-------|---------|-------------|
| Idle | "Saved" or nothing | No unsaved changes |
| Unsaved | "Unsaved changes" | Changes exist but timer hasn't fired |
| Saving | "Saving..." | Mutation in flight |
| Saved | "Autosaved at 2:34 PM" | Autosave completed successfully |
| Error | "Autosave failed -- click to retry" | Mutation failed |

**Configuration:**
- Interval configurable via Settings System: `writing_settings.autosave_interval` (default 30s)
- Minimum: 10 seconds. Maximum: 300 seconds.
- Disabled when editor is in read-only mode.

---

#### `editor.save_draft` - Save Draft

- **Airtable Record:** `rec9FlbyBq7uOAnAJ`
- **Type:** Client-initiated action (triggers `post.update` mutation)
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    content: v.string(),           // JSON.stringify(editor.getJSON())
    title: v.string(),
    excerpt: v.optional(v.string()),
    // ... other post fields passed through to Post System
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. User clicks "Save Draft" button or presses Ctrl+S (Cmd+S on Mac) when post status is `draft`
  2. Serialize the full editor state via `editor.getJSON()`
  3. Call `posts.update` mutation (Post System) with content, title, excerpt, etc.
  4. Post System clears `autosaveContent`, `autosaveTitle`, `autosavedAt` on successful save
  5. Show "Draft saved" toast notification
  6. Update save indicator to "Saved"
- **Events:** `post.updated` (via Post System)
- **Keyboard shortcut:** Ctrl+S (Cmd+S) -- intercepts browser save dialog

---

#### `editor.add_block` - Add Block

- **Airtable Record:** `recilArk92isTG8ZH`
- **Type:** Client-side editor command (no backend mutation)
- **Auth:** N/A (client-side only)
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Behavior:**
  1. User triggers block insertion via:
     - Clicking **+** (block inserter) button in toolbar or between blocks
     - Typing **/** in an empty paragraph (slash commands)
     - Pressing **Enter** at end of a block (inserts empty paragraph)
     - Dragging a block from the inserter panel
  2. Display block inserter UI (search bar, recently used, categorized list)
  3. On selection: insert the new TipTap node at cursor position, focus new block, close inserter
  4. For slash commands: floating suggestion menu filtered by text after `/`
- **Events:** None (client-side only; changes persisted via autosave or manual save)

**Block categories for inserter:**

| Category | Blocks |
|----------|--------|
| Text | Paragraph, Heading, List, Quote, Code Block, Table |
| Media | Image, Embed, Button |
| Design | Columns, Spacer, Divider, Callout |
| Reusable | All published reusable blocks |

---

#### `editor.remove_block` - Remove Block

- **Airtable Record:** `rec2LfzCxZrFEGCJj`
- **Type:** Client-side editor command (no backend mutation)
- **Auth:** N/A (client-side only)
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Behavior:**
  1. Triggered via: trash icon in block toolbar menu, Backspace/Delete on empty block, "Remove block" menu item
  2. Remove node from TipTap document via `editor.commands.deleteNode()`
  3. Focus moves to previous block (or next if first block was removed)
  4. Removal tracked in undo history (Ctrl+Z restores)
- **Confirmation:** No dialog for single block. Bulk delete shows 5-second "Undo" toast.
- **Events:** None (client-side only)

---

#### `editor.reorder_blocks` - Reorder Blocks

- **Airtable Record:** `recWShKMNNJAMRAWM`
- **Type:** Client-side editor command (no backend mutation)
- **Auth:** N/A (client-side only)
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Behavior:**
  1. Drag and drop: Grab 6-dot drag handle on hover, drag to new position, drop on indicator line
  2. Move up/down buttons: Arrow buttons in block toolbar
  3. Keyboard: Alt+Shift+Up/Down to move focused block
  4. Blue drop indicator line shown at target position during drag
  5. Supports dragging into/out of nested containers (columns, blockquote)
- **Events:** None (client-side only)

---

#### `editor.save_reusable` - Save Reusable Block

- **Airtable Record:** `rec908fC4gx8Pr4Kc`
- **Type:** Convex mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor (Authors and Contributors CANNOT create reusable blocks)
- **Args:**
  ```typescript
  {
    title: v.string(),
    content: v.string(),                         // JSON.stringify of selected block(s)
    postId: v.optional(v.id("posts")),           // Source post (for reference tracking)
  }
  ```
- **Returns:** `v.id("reusableBlocks")`
- **Behavior:**
  1. User selects one or more blocks in the editor
  2. Opens "more options" menu > "Save as reusable block"
  3. Dialog prompts for a name (title)
  4. On confirmation:
     - Serialize selected blocks to JSON
     - Call `reusableBlocks.create` mutation with `{ title, content, authorId, isPublished: true, usageCount: 0 }`
     - Replace selected blocks with a `reusableBlock` node referencing the new record ID
  5. Block appears in "Reusable" category of block inserter
- **Events:** None directly
- **Errors:**
  - Empty title: Show validation error
  - Empty content: Show validation error
  - Permission denied: Only Admin/Editor can save reusable blocks

**Reusable block management:**
- Editing a reusable block updates ALL instances (it is a reference, not a copy)
- Visual indicator: colored border + "Reusable: {title}" label
- "Convert to regular blocks": detaches from reference, makes independently editable
- Deleting from library: converts all references to regular blocks

---

### Queries

#### `reusableBlocks.list` - List Reusable Blocks

- **Type:** query
- **Auth:** Required
- **Args:**
  ```typescript
  {
    publishedOnly?: boolean,    // default true (for inserter)
    authorId?: string,          // filter by author
  }
  ```
- **Returns:** `Array<ReusableBlock>`
- **Behavior:** Returns all reusable blocks, optionally filtered by published status and author. Used by the block inserter's "Reusable" category.
- **Pagination:** Not paginated (expected to be a small set)
- **Real-time:** Yes -- Convex subscription updates inserter when blocks are created/deleted

#### `reusableBlocks.get` - Get Single Reusable Block

- **Type:** query
- **Auth:** Required
- **Args:**
  ```typescript
  {
    blockId: v.id("reusableBlocks"),
  }
  ```
- **Returns:** `ReusableBlock | null`
- **Behavior:** Returns a single reusable block by ID. Used by the ReusableBlock node extension to resolve content for rendering.

#### `reusableBlocks.update` - Update Reusable Block

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    blockId: v.id("reusableBlocks"),
    title?: v.optional(v.string()),
    content?: v.optional(v.string()),
    isPublished?: v.optional(v.boolean()),
  }
  ```
- **Returns:** `void`
- **Behavior:** Updates the reusable block. Changes propagate to all posts referencing it (since they resolve by ID at render time).

#### `reusableBlocks.delete` - Delete Reusable Block

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    blockId: v.id("reusableBlocks"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Delete the reusable block record
  2. All posts referencing this block will fail to resolve -- the ReusableBlock node renders a "Block not found" placeholder
  3. Consider: scan posts and convert references to inline content before deleting (deferred to implementation)

---

## Events

### `revision.created`

- **Airtable Record:** `recontpS7CkCiCrKV`
- **Type:** Content
- **Triggered By:** `editor.autosave` action
- **Payload:**
  ```typescript
  {
    revisionId: Id<"revisions">,
    postId: Id<"posts">,
    authorId: string,           // user identifier
    revisionNumber: number,
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: Site notification to post author (if different from the editor making the autosave)
  - Audit Log: No (autosave revisions are too frequent for audit logging)
  - Side Effects: Revision System increments revision count on the post

**Note:** Most editor actions (add block, remove block, reorder) are client-side-only operations that do not emit backend events. They are persisted through the Post System's `post.update` mutation which emits its own events.

---

## Admin Routes & UI

The Content Editor System does not own standalone routes. It is embedded as a component within Post System and Page System routes.

### Add New Post (`/admin/posts/new`)

- **Purpose:** Create a new blog post with the full block editor
- **WordPress Equivalent:** `post-new.php`
- **Airtable Route Record:** `reckNURGq8m81Hq3s`
- **Owning Systems:** Post System (primary), Content Editor System (embedded)
- **Layout:**
  ```
  +---------------------------------------------------------------+
  | Admin Header (breadcrumb, save status, action buttons)        |
  +-------------------------------------------+-------------------+
  |                                           |                   |
  |  Title Input (large, borderless)          |   Document        |
  |                                           |   Sidebar         |
  |  +---------+                              |                   |
  |  |  + Add  |  Content area                |   - Status        |
  |  +---------+                              |   - Visibility    |
  |                                           |   - Schedule      |
  |  [Block 1: Paragraph]                     |   - Permalink     |
  |  [Block 2: Heading]                       |   - Categories    |
  |  [Block 3: Image]                         |   - Tags          |
  |  [Block 4: Paragraph]                     |   - Featured Img  |
  |  ...                                      |   - Excerpt       |
  |                                           |   - Discussion    |
  |  +---------+                              |                   |
  |  |  + Add  |                              |   Block Settings  |
  |  +---------+                              |   (when selected) |
  |                                           |                   |
  +-------------------------------------------+-------------------+
  | Editor Footer (word count, last saved)                        |
  +---------------------------------------------------------------+
  ```
- **Key Components:**
  - `<ContentEditorProvider>` - Context provider (editor instance, config, save handlers)
  - `<EditorToolbar>` - Top bar (add, undo/redo, view toggles, save buttons)
  - `<TitleInput>` - Large borderless title field (`text-3xl font-bold`, placeholder "Add title")
  - `<TipTapEditor>` - Main editing area with `EditorContent` component
  - `<BlockWrapper>` - Per-block wrapper (drag handle, toolbar trigger, selection indicator)
  - `<BlockToolbar>` - Floating toolbar per block (formatting, type selector, more options)
  - `<BlockInserter>` - Floating/panel block picker (categorized, searchable)
  - `<SlashCommandMenu>` - Floating suggestion menu for `/` commands
  - `<EditorSidebar>` - Right sidebar with Document/Block tabs
  - `<DocumentPanel>` - Post settings (status, categories, tags, featured image, excerpt)
  - `<BlockSettingsPanel>` - Selected block settings
  - `<EditorFooter>` - Word count, character count, block count, reading time, last saved
  - `<LinkPopover>` - Link editing popover
  - `<MediaPickerDialog>` - Media library picker (from Media System)
- **Data Requirements:** `posts.get` query (for editing), `reusableBlocks.list` query (for inserter)
- **User Interactions:** All block editing operations, autosave, manual save, publish
- **Real-Time:** Autosave status, reusable blocks list, document sidebar fields

### Edit Post (`/admin/posts/$postId/edit`)

- **Purpose:** Edit an existing blog post
- **WordPress Equivalent:** `post.php?post=X&action=edit`
- **Airtable Route Record:** `rec1EmEHCSek5WztL`
- **Identical to Add New Post** except: loads existing content via `posts.get`, shows "Update" instead of "Publish" for published posts, shows autosave recovery dialog if `autosaveContent` is newer than `content`

### Add New Page (`/admin/pages/new`)

- **Purpose:** Create a new page with the full block editor
- **WordPress Equivalent:** `post-new.php?post_type=page`
- **Airtable Route Record:** `recMb6TiwFmxhEbDJ`
- **Same editor, different document sidebar:** No categories/tags. Has parent page selector and template selector.

### Edit Page (`/admin/pages/$pageId/edit`)

- **Purpose:** Edit an existing page
- **WordPress Equivalent:** `post.php?post=X&action=edit` (page post type)
- **Airtable Route Record:** `reczUldaBKhjDeWVE`

---

## Website Routes

The Content Editor System does not have its own website routes. However, it provides the **content rendering pipeline** used by the Website App to convert stored JSON into semantic HTML.

### Content Rendering Pipeline

```typescript
// ConvexPress-Website/apps/web/lib/renderContent.ts

import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
// + custom extensions (EmbedBlock, CalloutBlock, ButtonBlock, etc.)

export function renderContent(jsonContent: string): string {
  try {
    const doc = JSON.parse(jsonContent);
    return generateHTML(doc, [
      StarterKit.configure({ codeBlock: false }),
      Image,
      Table, TableRow, TableCell, TableHeader,
      Link, TextAlign, Underline, Superscript, Subscript,
      Highlight, TextStyle, Color,
      CodeBlockLowlight,
      // All custom extensions with renderHTML() methods
    ]);
  } catch {
    return "<p>Content could not be rendered.</p>";
  }
}
```

**Reusable block resolution:** `reusableBlock` nodes are resolved by fetching the referenced block's content from Convex and recursively rendering it. This happens at query time (in the post query's return transformation) to avoid N+1 queries on the frontend.

---

## Notifications

### Email Notifications

None. The Content Editor System does not trigger email notifications directly. Autosave and save operations trigger events that may be handled by the Post System's notification pipeline.

### Site Notifications

| Name | Event | Type | Persistent | Recipients |
|------|-------|------|-----------|------------|
| Revision Created | `revision.created` | Info | No | Post author (if different from the editor performing autosave) |

---

## Role & Capability Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:---:|:---:|:---:|:---:|:---:|
| Open and use the editor | Yes | Yes | Yes | Yes | No |
| Insert image blocks (upload/library) | Yes | Yes | Yes | No | No |
| Edit others' posts via editor | Yes | Yes | No | No | No |
| Create reusable blocks | Yes | Yes | No | No | No |
| Insert existing reusable blocks | Yes | Yes | Yes | Yes | No |
| Edit/delete reusable blocks | Yes | Yes | No | No | No |
| Use all text formatting | Yes | Yes | Yes | Yes | No |
| Use slash commands | Yes | Yes | Yes | Yes | No |
| Drag-and-drop reorder | Yes | Yes | Yes | Yes | No |
| Autosave | Yes | Yes | Yes | Yes | No |
| Manual save (Save Draft) | Yes | Yes | Yes | Yes | No |
| Publish | Yes | Yes | Yes | No | No |
| Raw JSON editor toggle | Yes | No | No | No | No |

---

## Dependencies

### Depends On

| System | Classification | What Is Needed |
|--------|---------------|----------------|
| **Post System** | **Hard** | `posts` table (content, autosaveContent, autosaveTitle, autosavedAt fields); `posts.update`, `posts.autosave` mutations; `posts.get` query |
| **Media System** | **Hard** | Image upload API, media library picker component, media record (URL, dimensions, alt text) |
| **Page System** | **Medium** | Uses same editor component for page content editing; identical integration pattern as Post System |
| **Taxonomy System** | **Soft** | Document sidebar renders category/tag selectors (owned by Taxonomy System, not by editor) |
| **Revision System** | **Soft** | Autosave triggers `revision.created` event; revision sidebar shows history link |
| **Custom Field System** | **Soft** | Document sidebar renders custom field UI (owned by Custom Field System) |
| **SEO System** | **Soft** | Document sidebar renders SEO fields (owned by SEO System) |
| **Settings System** | **Soft** | Reads `writing_settings.autosave_interval` and `writing_settings.default_editor_mode` |

### Depended On By

| System | What They Need |
|--------|---------------|
| **Post System** | The editor component itself -- Post System routes embed `<ContentEditorProvider>` |
| **Page System** | Same editor component for page editing |
| **Website App** | Content rendering pipeline (`renderContent()` function + TipTap extension registry) |
| **Revision System** | Receives `revision.created` events triggered by autosave |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/reusableBlocks/schema.ts` - 1 table (`reusableBlocks`)
- [ ] `convex/reusableBlocks/queries.ts` - 2 queries (`list`, `get`)
- [ ] `convex/reusableBlocks/mutations.ts` - 3 mutations (`create`, `update`, `delete`)
- [ ] `convex/reusableBlocks/helpers.ts` - Shared validation logic

### Admin Frontend (ConvexPress-Admin/apps/web/)

**Core Editor Components:**
- [ ] `src/components/editor/ContentEditorProvider.tsx` - Context provider with editor instance, config, save handlers
- [ ] `src/components/editor/useContentEditor.ts` - Core hook: editor init, save/load, state tracking
- [ ] `src/components/editor/useEditorConfig.ts` - TipTap editor configuration (all extensions)
- [ ] `src/components/editor/useAutosave.ts` - Autosave hook with debounce and status tracking

**UI Components:**
- [ ] `src/components/editor/EditorToolbar.tsx` - Top bar (add, undo/redo, view toggles, save)
- [ ] `src/components/editor/TitleInput.tsx` - Borderless title input (`text-3xl font-bold`)
- [ ] `src/components/editor/BlockWrapper.tsx` - Per-block wrapper (drag handle, selection, toolbar)
- [ ] `src/components/editor/BlockToolbar.tsx` - Floating toolbar per block
- [ ] `src/components/editor/BlockInserter.tsx` - Categorized block picker panel
- [ ] `src/components/editor/SlashCommandMenu.tsx` - Floating suggestion menu
- [ ] `src/components/editor/EditorSidebar.tsx` - Right sidebar container
- [ ] `src/components/editor/DocumentPanel.tsx` - Document tab (status, categories, tags, etc.)
- [ ] `src/components/editor/BlockSettingsPanel.tsx` - Block settings tab
- [ ] `src/components/editor/EditorFooter.tsx` - Word count, block count, reading time, last saved
- [ ] `src/components/editor/LinkPopover.tsx` - Link editing popover
- [ ] `src/components/editor/SaveStatusIndicator.tsx` - Autosave status display

**Custom TipTap Extensions:**
- [ ] `src/components/editor/extensions/slash-commands.ts` - Slash command suggestion plugin
- [ ] `src/components/editor/extensions/embed-block.ts` - YouTube, Twitter, oEmbed embeds
- [ ] `src/components/editor/extensions/callout-block.ts` - Info/Warning/Error/Success callouts
- [ ] `src/components/editor/extensions/button-block.ts` - CTA button with link, text, variant
- [ ] `src/components/editor/extensions/spacer-block.ts` - Vertical spacing block
- [ ] `src/components/editor/extensions/columns-block.ts` - Multi-column layout (2, 3, 4 cols)
- [ ] `src/components/editor/extensions/divider-block.ts` - Styled horizontal divider
- [ ] `src/components/editor/extensions/reusable-block.ts` - Reference to saved reusable block

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/lib/renderContent.ts` - JSON-to-HTML rendering pipeline using `generateHTML()`
- [ ] `src/lib/extensions/` - Mirror of custom extensions with `renderHTML()` methods for SSR

### Package Dependencies

```bash
# Install in ConvexPress-Admin
bun add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image \
  @tiptap/extension-table @tiptap/extension-link @tiptap/extension-placeholder \
  @tiptap/extension-text-align @tiptap/extension-underline @tiptap/extension-superscript \
  @tiptap/extension-subscript @tiptap/extension-highlight @tiptap/extension-color \
  @tiptap/extension-text-style @tiptap/extension-typography @tiptap/extension-character-count \
  @tiptap/extension-code-block-lowlight @tiptap/extension-dropcursor @tiptap/extension-gapcursor \
  lowlight highlight.js

# Install in ConvexPress-Website (for rendering)
bun add @tiptap/html @tiptap/pm @tiptap/starter-kit @tiptap/extension-image \
  @tiptap/extension-table @tiptap/extension-link @tiptap/extension-text-align \
  @tiptap/extension-underline @tiptap/extension-superscript @tiptap/extension-subscript \
  @tiptap/extension-highlight @tiptap/extension-color @tiptap/extension-text-style \
  @tiptap/extension-code-block-lowlight lowlight highlight.js
```

---

## Edge Cases & Gotchas

1. **Autosave recovery dialog**: When a user opens a post that has `autosaveContent` with a timestamp newer than the last manual save, the editor must show a recovery dialog: "There is an autosave of this post that is more recent than the version below. View the autosave / Dismiss." This mirrors WordPress's autosave recovery behavior.

2. **Concurrent editing**: If two users open the same post, the Post System's `_edit_lock` meta field prevents silent overwrites. The editor should show "This post is being edited by {user}" warning when a lock exists. The lock should expire after 2 minutes of inactivity.

3. **Empty content on save**: The editor should warn (not block) when saving a post with no content blocks. WordPress allows saving empty posts.

4. **Large documents**: Posts with 500+ blocks may cause performance degradation. The editor should lazy-load extensions not present in the initial content and consider virtual rendering for off-screen blocks.

5. **Reusable block deletion cascade**: When a reusable block is deleted from the library, all posts referencing it will have a broken reference. The `reusableBlock` node should render a "Block not found" placeholder gracefully. Consider: scan and convert references to inline content before deletion.

6. **Reusable block circular references**: A reusable block should not be able to contain a reference to itself (infinite recursion). Validate on save.

7. **Image blocks without upload capability**: Contributors cannot upload files (`upload_files` capability). When they add an Image block, only the "Insert from URL" option should be available. The Upload and Media Library options should be hidden.

8. **Paste handling from external sources**: Google Docs uses non-standard HTML with comment markers and span styles. Microsoft Word uses `mso-*` styles and `o:p` tags. Both need special paste processing rules to preserve formatting while stripping proprietary markup.

9. **JSON content field size**: Convex has string field limits. Very large posts (thousands of blocks) could exceed practical limits. Monitor content size and warn users approaching limits.

10. **Extension ordering**: TipTap extension order matters. `StarterKit` must be configured with `codeBlock: false`, `dropcursor: false`, `gapcursor: false` to avoid conflicts with standalone extensions that provide these features.

11. **Code block language loading**: Loading all highlight.js languages adds ~200KB to the bundle. Use dynamic imports to load languages on demand when a code block with that language is first encountered.

12. **Ctrl+S browser conflict**: The editor must intercept `Ctrl+S` (Cmd+S on Mac) to trigger draft save instead of the browser's "Save Page As" dialog. Use `event.preventDefault()` in a keydown handler.

13. **Network disconnect during editing**: Content is preserved in the TipTap editor's in-memory state. Show a banner: "You're offline. Changes are saved locally." Resume autosave when connection is restored.

14. **Table cell merging edge cases**: Merging cells that contain block content should concatenate the content. Splitting a merged cell should place all content in the first resulting cell.

15. **Embed URL validation**: Embed blocks should validate URLs against a whitelist of supported providers (YouTube, Vimeo, Twitter/X). Unknown URLs should show a "Provider not supported" error or fall back to a generic link preview via oEmbed.

16. **Reading time calculation**: Estimated at 200 words per minute. Must count only visible text content (exclude code blocks, image alt text, and block attributes from word count).

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `register_block_type()` | TipTap `Node.create()` extension | Each block is a TipTap Node extension |
| `registerBlockType()` (JS) | TipTap `Extension.create()` | Extension registry pattern |
| `wp.blocks.serialize()` | `editor.getJSON()` | Serialize editor state to storable format |
| `wp.blocks.parse()` | `editor.setContent(JSON.parse(json))` | Deserialize stored content to editor state |
| `wp.data.dispatch('core/editor').savePost()` | `posts.update` mutation via `useContentEditor().save()` | Manual save |
| `wp.data.dispatch('core/editor').autosave()` | `posts.autosave` mutation via `useAutosave()` | Debounced autosave |
| `wp.blockEditor.BlockInserter` | `<BlockInserter>` component | Block picker UI |
| `wp.blockEditor.BlockToolbar` | `<BlockToolbar>` component | Per-block formatting toolbar |
| `wp.blockEditor.InspectorControls` | `<BlockSettingsPanel>` component | Sidebar settings per block |
| `wp.blockEditor.RichText` | TipTap `EditorContent` component | The main editing area |
| `wp_editor()` (PHP) | `<ContentEditorProvider>` + `useContentEditor()` | Full editor initialization |
| `the_content` filter | `renderContent()` function | Server-side content rendering to HTML |
| `wp.blocks.switchToBlockType()` | TipTap `editor.commands.setNode()` | Block type transformation |
| `WP_Block_Type_Registry` | TipTap extension array in `useEditorConfig()` | Central block registry |
| `wp.data.select('core/editor').getCurrentPost()` | `useQuery(api.posts.get, { postId })` | Reactive post data |

---

## Keyboard Shortcuts Reference

### Text Formatting

| Shortcut | Action |
|----------|--------|
| Ctrl+B | Bold |
| Ctrl+I | Italic |
| Ctrl+U | Underline |
| Ctrl+Shift+X | Strikethrough |
| Ctrl+E | Inline code |
| Ctrl+K | Insert/edit link |
| Ctrl+Shift+H | Highlight |

### Block Operations

| Shortcut | Action |
|----------|--------|
| Enter | New paragraph after current block |
| Shift+Enter | Soft line break (within block) |
| Backspace (empty block) | Remove block, merge with previous |
| Delete (empty block) | Remove block, merge with next |
| Tab (in list) | Indent list item |
| Shift+Tab (in list) | Outdent list item |
| Alt+Shift+Up | Move block up |
| Alt+Shift+Down | Move block down |
| / (empty paragraph) | Open slash command menu |

### Editor Actions

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save (draft save or update) |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+A | Select all in current block (press again for all blocks) |
| Ctrl+Shift+\\ | Clear formatting |
| Escape | Deselect block / close popover |
| Ctrl+/ | Open block inserter (keyboard-accessible) |

### Navigation

| Shortcut | Action |
|----------|--------|
| Arrow Up/Down | Move cursor between blocks |
| Home/End | Jump to start/end of current block |
| Ctrl+Home/End | Jump to start/end of document |
| Tab (in table) | Move to next cell |
| Shift+Tab (in table) | Move to previous cell |

---

## Node Type Registry (Block Reference)

### Standard Nodes (via TipTap extensions)

| Node Type | Extension | Attributes | Content Type |
|-----------|----------|------------|--------------|
| `doc` | Built-in | -- | Block nodes |
| `paragraph` | StarterKit | `textAlign` | Inline (text, marks) |
| `heading` | StarterKit | `level` (1-6), `textAlign` | Inline |
| `bulletList` | StarterKit | -- | `listItem` array |
| `orderedList` | StarterKit | `start` | `listItem` array |
| `listItem` | StarterKit | -- | Block content |
| `blockquote` | StarterKit | -- | Block content |
| `codeBlock` | CodeBlockLowlight | `language` | Plain text |
| `horizontalRule` | StarterKit | -- | Void |
| `hardBreak` | StarterKit | -- | Inline void |
| `image` | Image | `src`, `alt`, `title`, `width`, `height`, `alignment` | Void |
| `table` | Table | -- | `tableRow` array |
| `tableRow` | Table | -- | `tableCell`/`tableHeader` array |
| `tableCell` | Table | `colspan`, `rowspan`, `colwidth` | Block content |
| `tableHeader` | Table | `colspan`, `rowspan`, `colwidth` | Block content |

### Custom Nodes

| Node Type | Extension | Attributes | Content Type |
|-----------|----------|------------|--------------|
| `embed` | EmbedBlock | `url`, `provider`, `html`, `width`, `height` | Void |
| `callout` | CalloutBlock | `type` (info/warning/error/success), `title` | Block content |
| `button` | ButtonBlock | `text`, `url`, `variant` (primary/secondary/outline), `alignment` | Void |
| `spacer` | SpacerBlock | `height` (px) | Void |
| `columns` | ColumnsBlock | `count` (2/3/4), `ratio` | `column` array |
| `column` | ColumnsBlock | -- | Block content |
| `divider` | DividerBlock | `style` (solid/dashed/dotted/double) | Void |
| `reusableBlock` | ReusableBlock | `blockId` (reference to reusableBlocks table) | Void (resolved at render) |

### Mark Types (Inline Formatting)

| Mark Type | Extension | Attributes | Shortcut |
|-----------|----------|------------|----------|
| `bold` | StarterKit | -- | Ctrl+B |
| `italic` | StarterKit | -- | Ctrl+I |
| `strike` | StarterKit | -- | Ctrl+Shift+X |
| `code` | StarterKit | -- | Ctrl+E |
| `underline` | Underline | -- | Ctrl+U |
| `link` | Link | `href`, `target`, `rel` | Ctrl+K |
| `highlight` | Highlight | `color` | Ctrl+Shift+H |
| `textStyle` | TextStyle | `color` | -- |
| `superscript` | Superscript | -- | -- |
| `subscript` | Subscript | -- | -- |

---

## Slash Command Aliases

| Alias | Block Type |
|-------|-----------|
| `/p`, `/paragraph`, `/text` | Paragraph |
| `/h`, `/h1`, `/heading` | Heading 1 |
| `/h2`, `/heading2` | Heading 2 |
| `/h3`, `/heading3` | Heading 3 |
| `/h4` | Heading 4 |
| `/ul`, `/list`, `/bullet` | Bullet List |
| `/ol`, `/numbered`, `/ordered` | Ordered List |
| `/quote`, `/blockquote` | Blockquote |
| `/code`, `/codeblock` | Code Block |
| `/img`, `/image`, `/photo` | Image |
| `/table` | Table |
| `/embed`, `/youtube`, `/video` | Embed |
| `/callout`, `/alert`, `/note` | Callout |
| `/button`, `/cta` | Button |
| `/spacer`, `/space` | Spacer |
| `/divider`, `/hr`, `/line` | Divider |
| `/columns`, `/cols` | Columns |

---

## Performance Requirements

| Metric | Target | Strategy |
|--------|--------|----------|
| Editor load time | < 500ms (< 50 blocks) | Lazy-load extensions not in initial content; code-split editor bundle |
| Typing latency | < 16ms (60fps) | ProseMirror efficient DOM diffing; avoid React re-renders on keystroke |
| Autosave latency | < 200ms mutation round-trip | Convex mutation + debounce; optimistic UI for save status |
| Large document support | 500+ blocks without degradation | Virtual rendering for off-screen blocks (deferred to v2 if needed) |
| Bundle size | < 150KB gzipped (editor chunk) | Tree-shake unused extensions; dynamic import for code highlighting languages |
| Memory | < 100MB for 200-block document | ProseMirror efficient document model; limit undo history to 100 steps |

### Code Splitting Strategy

```typescript
// Lazy-load the editor component
const ContentEditor = React.lazy(() => import("./components/editor/ContentEditor"));

// Lazy-load syntax highlighting languages
const loadLanguage = async (lang: string) => {
  const { lowlight } = await import("lowlight/lib/core");
  const module = await import(`highlight.js/lib/languages/${lang}`);
  lowlight.registerLanguage(lang, module.default);
};
```

---

## Content JSON Document Format Example

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [
        { "type": "text", "text": "Introduction" }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "This is a " },
        { "type": "text", "marks": [{ "type": "bold" }], "text": "bold" },
        { "type": "text", "text": " paragraph with a " },
        {
          "type": "text",
          "marks": [{ "type": "link", "attrs": { "href": "https://example.com" } }],
          "text": "link"
        },
        { "type": "text", "text": "." }
      ]
    },
    {
      "type": "image",
      "attrs": {
        "src": "https://storage.example.com/photo.jpg",
        "alt": "A landscape photo",
        "title": "Photo caption",
        "width": 800,
        "height": 600
      }
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [{ "type": "text", "text": "First item" }]
            }
          ]
        }
      ]
    },
    {
      "type": "codeBlock",
      "attrs": { "language": "typescript" },
      "content": [
        { "type": "text", "text": "const greeting = \"Hello, world!\";" }
      ]
    }
  ]
}
```

---

## Accessibility Requirements (WCAG 2.1)

| Requirement | Implementation |
|-------------|---------------|
| Keyboard navigation | All blocks focusable via Tab/Arrow keys. All toolbar controls keyboard-accessible. |
| Screen reader support | Blocks announce type and position ("Heading level 2, block 3 of 15"). Toolbar buttons have `aria-label`. |
| Focus management | Focus moves logically: title -> first block -> subsequent blocks. Insert/remove moves focus predictably. |
| Color contrast | All text meets 4.5:1 ratio. Selection indicator meets 3:1. |
| Reduced motion | Drag animations respect `prefers-reduced-motion`. |
| ARIA roles | Editor: `role="textbox"` + `aria-multiline="true"`. Toolbar: `role="toolbar"`. Inserter: `role="listbox"`. |

---

## Out of Scope (v1)

- Real-time collaboration (Yjs) -- deferred to v2
- Block patterns/templates
- Custom HTML block (security concern)
- Gallery block (use multiple image blocks)
- Audio/Video blocks (use Embed block)
- Form blocks
- Custom block registration API
- Mobile-optimized editor UX
- AI writing assistance
- Version diffing in editor
- Block animations/transitions
- Block locking
- Block comments/annotations

---

## Open Questions

1. **Embed provider list**: Which providers for v1? YouTube, Vimeo, Twitter/X, generic oEmbed?
2. **Code block languages**: Full highlight.js (~200KB) or curated top 20 (~30KB)?
3. **Autosave conflict resolution**: Show recovery dialog (WordPress-style) or auto-load autosave?
4. **Image optimization**: Generate responsive `srcset` in editor or in rendering pipeline?
5. **TipTap Pro licensing**: License Pro for drag-and-drop, AI tools, collaboration for future?
6. **Maximum content size**: Practical upper limit for `posts.content` in Convex?
