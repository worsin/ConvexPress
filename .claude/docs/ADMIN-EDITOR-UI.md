# Admin Editor Layout UI - Expert Knowledge Document

**System:** Admin Editor Layout UI
**Status:** Implementation Ready
**Priority:** P0 - Critical
**Expert Type:** UI Expert (frontend only -- consumes backend system experts' Convex functions)
**WordPress Equivalent:** Post/Page editor screen layout: metabox containers, Publish box, Categories metabox, Tags metabox, Featured Image metabox, Excerpt metabox, Discussion metabox, Author metabox, Slug metabox, Custom Fields metabox, Revisions link, Screen Options
**Last Analyzed:** 2026-02-09

---

## Quick Reference

### What This Expert Covers

The Admin Editor Layout UI Expert owns the two-column editor page layout used by both the Post System and Page System. This is the container-level UI that surrounds the Content Editor (TipTap block editor) with sidebar metaboxes for post/page metadata. The expert covers:

1. **Two-column layout** -- main content area (~70%) on the left, sidebar metabox column (~30%) on the right
2. **Publish metabox** -- status, visibility, schedule picker, Save Draft / Preview / Publish / Update buttons
3. **Categories metabox** -- hierarchical checkbox tree with "Add New Category" inline form
4. **Tags metabox** -- comma-separated tag input with autocomplete suggestions and removable tag chips
5. **Featured Image metabox** -- image preview thumbnail with Set / Remove Featured Image controls
6. **Custom Fields metabox** -- key-value pair editor for `postMeta` records
7. **Excerpt metabox** -- plain textarea for manual excerpt
8. **Discussion metabox** -- comment status toggle checkbox
9. **Slug/permalink editor** -- editable slug with live permalink preview
10. **Author selector** -- dropdown for reassigning post author (Editor+ only)
11. **Revisions metabox** -- revision count display with "Browse N revisions" link
12. **SEO metabox** -- title, description, slug preview for search engine optimization
13. **Metabox drag-and-drop reordering** -- user-customizable sidebar layout via @dnd-kit
14. **Responsive layout** -- single-column stacked layout on mobile viewports

This expert does NOT own:
- The block editor itself (Content Editor System Expert)
- Convex mutations/queries (backend system experts own those)
- Post list tables (Admin List Table UI Expert)
- The admin shell / sidebar / top bar (Admin Shell & Navigation UI Expert)

### Key Concepts

| Concept | Description |
|---------|-------------|
| **EditorLayout** | Root layout component providing the two-column grid |
| **Metabox** | A collapsible, draggable sidebar panel containing a specific metadata control |
| **MetaboxContainer** | The wrapper component providing drag handle, collapse toggle, and title bar |
| **Publish Box** | The primary action metabox -- always first in sidebar, sticky on scroll |
| **EditorForm** | The unified form state managed by TanStack Form + Zod covering all metadata fields |
| **Autosave** | Debounced background save (2s after typing stops, or every 60s) using `post.autosave` mutation |
| **Dirty State** | Form-level dirty detection using TanStack Form's `isDirty` property |
| **beforeunload** | Browser-level unsaved changes warning tied to dirty state |
| **Content Type** | Either `"post"` or `"page"` -- determines which metaboxes are visible |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Layout framework** | PHP `do_meta_boxes()` + jQuery Sortable | React components + @dnd-kit |
| **State management** | jQuery form serialization + global `wp.data` store | TanStack Form + Zod + Convex reactive queries |
| **Metabox rendering** | Server-rendered PHP callbacks registered via `add_meta_box()` | React components composed in EditorLayout |
| **Drag-and-drop** | jQuery UI Sortable | @dnd-kit/core + @dnd-kit/sortable |
| **Publish box position** | Fixed at top of sidebar | CSS `position: sticky` at top of sidebar column |
| **Autosave indicator** | "Last saved at" text in header | Status badge in Publish box header |
| **Unsaved changes** | `wp.autosave.server.postChanged()` | TanStack Form `isDirty` + content hash comparison |
| **Screen Options** | WordPress "Screen Options" tab toggles metabox visibility | Per-user metabox visibility preferences stored in localStorage |
| **Category UI** | `wp_terms_checklist()` PHP walker | React recursive `CategoryTreeNode` component |
| **Tag UI** | `tagBox` jQuery plugin with suggest.js autocomplete | React controlled input with @base-ui/react Combobox |
| **Featured image** | `wp.media` modal frame | Inline MediaPicker panel (no modal) |
| **Slug editing** | Inline editable link below title | Dedicated SlugEditor metabox with preview URL |
| **UI library** | WordPress jQuery UI wrappers | @base-ui/react (NEVER Radix) |

---

## Architecture Overview

### Component Hierarchy

```
EditorRoute (route file: posts/$postId/edit.tsx or posts/new.tsx)
  |
  +-- EditorLayout
       |
       +-- EditorHeader
       |     +-- Title (h1: "Edit Post" / "Add New Post")
       |     +-- ViewPostLink (if published)
       |     +-- AutosaveStatusBadge
       |
       +-- EditorMainColumn (left ~70%)
       |     +-- TitleInput (borderless, large, auto-generates slug on blur)
       |     +-- SlugEditor (permalink preview + editable slug, below title)
       |     +-- ContentEditor (Content Editor System -- TipTap block editor)
       |     +-- Below-editor metaboxes (if any custom field groups target "after_content"):
       |           +-- CustomFieldsMetabox (if location rules match)
       |
       +-- EditorSidebarColumn (right ~30%)
             +-- DndContext (metabox reorder container)
                   +-- SortableContext
                         +-- PublishBox (sticky, always first, not draggable)
                         +-- CategoriesMetabox (post only)
                         +-- TagsMetabox (post only)
                         +-- FeaturedImageMetabox
                         +-- ExcerptMetabox
                         +-- DiscussionMetabox
                         +-- AuthorSelector (Editor+ only)
                         +-- RevisionsMetabox (edit mode only)
                         +-- SEOMetabox (if SEO System active)
                         +-- CustomFieldsMetabox (sidebar position groups)
```

### Data Flow

```
Route loads -> Convex query: posts.get (edit) or posts.create auto-draft (new)
  -> TanStack Form initialized with post data
  -> Each metabox reads from form state via useEditorForm hook
  -> User modifies metadata in metaboxes
  -> Form state updates (dirty flag set)
  -> Autosave debounce timer starts
  -> After 2s idle: autosave mutation fires (post.autosave)
  -> On "Publish" / "Update" / "Save Draft" button click:
     -> Form validation via Zod schema
     -> If valid: post.create/post.update/post.publish mutation
     -> Clear autosave fields
     -> Show success toast via Sonner
     -> If new post published: redirect to edit route
```

### Real-Time Behavior

- **Publish Box status** -- Updates reactively when post status changes server-side (e.g., scheduled post auto-publishes)
- **Revision count** -- Updates in RevisionsMetabox when another admin session creates a revision
- **Edit lock warning** -- PostEditLockNotice appears when another user opens the same post (via `_edit_lock` meta)
- **Category tree** -- Updates reactively if another admin creates a new category
- **Featured image** -- If the selected media item is deleted, the preview gracefully handles the missing image

### Authentication & Authorization

This expert does NOT perform auth checks directly. Auth is handled by:
1. The route-level `beforeLoad` guard (Admin Shell UI Expert / Routing System Expert)
2. Convex mutations (backend system experts validate capabilities)

However, the editor UI conditionally renders controls based on the user's role:

| Control | Visibility Rule |
|---------|----------------|
| "Publish" button | Author+ (Contributors see "Submit for Review") |
| Visibility: Private | Author+ (Contributors cannot set private) |
| Visibility: Password | Author+ (Contributors cannot set password) |
| Author dropdown | Editor+ only (Authors cannot reassign) |
| Sticky checkbox | Editor+ only |
| "Move to Trash" link | Users with `delete_posts` capability |
| Category "Add New" link | Editor+ (or users with `manage_categories`) |
| Custom Fields metabox | Users with `edit_custom_field_values` capability |

---

## TypeScript Types

### Editor State Types

```typescript
// ConvexPress-Admin/apps/web/src/types/editor.ts

import type { Id } from "@backend/convex/_generated/dataModel";

/** The content type being edited */
export type EditorContentType = "post" | "page";

/** Post status values */
export type PostStatus = "auto-draft" | "draft" | "pending" | "publish" | "future" | "private" | "trash";

/** Post visibility values */
export type PostVisibility = "public" | "private" | "password";

/** Comment status values */
export type CommentStatus = "open" | "closed";

/** The form values managed by TanStack Form */
export interface EditorFormValues {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: PostStatus;
  visibility: PostVisibility;
  password: string;
  commentStatus: CommentStatus;
  isSticky: boolean;
  featuredImageId: string | null;
  authorId: string;
  scheduledFor: Date | null;
  categoryIds: string[];
  tagIds: string[];
  menuOrder: number;
}

/** Autosave state tracked separately from form */
export interface AutosaveState {
  status: "idle" | "saving" | "saved" | "error";
  lastSavedAt: number | null;
  error: string | null;
}

/** Metabox configuration for drag-and-drop ordering */
export interface MetaboxConfig {
  id: string;
  title: string;
  isCollapsed: boolean;
  isVisible: boolean;
  isDraggable: boolean;
  position: "sidebar" | "main" | "after_title";
}

/** The default metabox ordering for posts */
export const DEFAULT_POST_METABOXES: MetaboxConfig[] = [
  { id: "publish", title: "Publish", isCollapsed: false, isVisible: true, isDraggable: false, position: "sidebar" },
  { id: "categories", title: "Categories", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "tags", title: "Tags", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "featured-image", title: "Featured Image", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "excerpt", title: "Excerpt", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "discussion", title: "Discussion", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "author", title: "Author", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "revisions", title: "Revisions", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "slug", title: "Slug", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "seo", title: "SEO", isCollapsed: true, isVisible: true, isDraggable: true, position: "sidebar" },
];

/** The default metabox ordering for pages */
export const DEFAULT_PAGE_METABOXES: MetaboxConfig[] = [
  { id: "publish", title: "Publish", isCollapsed: false, isVisible: true, isDraggable: false, position: "sidebar" },
  { id: "featured-image", title: "Featured Image", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "excerpt", title: "Excerpt", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "discussion", title: "Discussion", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "author", title: "Author", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "revisions", title: "Revisions", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "slug", title: "Slug", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "page-attributes", title: "Page Attributes", isCollapsed: false, isVisible: true, isDraggable: true, position: "sidebar" },
  { id: "seo", title: "SEO", isCollapsed: true, isVisible: true, isDraggable: true, position: "sidebar" },
];

/** User preferences for metabox layout, stored in localStorage */
export interface MetaboxPreferences {
  order: string[];
  collapsed: string[];
  hidden: string[];
}

/** Zod schema for editor form validation */
// See useEditorForm hook for full Zod schema
```

---

## Component Inventory

### Layout Components

#### `EditorLayout`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/EditorLayout.tsx`
- **Purpose:** Root layout component that provides the two-column grid, EditorHeader, and DndContext for metabox reordering.
- **Props:**
  ```typescript
  interface EditorLayoutProps {
    contentType: EditorContentType;          // "post" or "page"
    mode: "new" | "edit";                    // Determines header text and available features
    postId?: Id<"posts">;                    // Required in edit mode
    children: React.ReactNode;               // The ContentEditor (TipTap) goes here
  }
  ```
- **Responsibilities:**
  - Renders the two-column CSS Grid: `grid-cols-1 lg:grid-cols-[1fr_340px]`
  - Wraps sidebar metaboxes in `DndContext` and `SortableContext` from @dnd-kit
  - Manages metabox order state via `useMetaboxOrder` hook
  - Provides `EditorFormProvider` context (TanStack Form instance)
  - Handles `beforeunload` browser event for unsaved changes warning
  - Renders `PostEditLockNotice` in edit mode
- **Base UI Dependencies:** None directly (delegates to child components)
- **Styling:** Uses CSS variables only (no hardcoded colors). Main column has `min-w-0` to prevent content overflow. Sidebar column has `sticky top-16` on desktop.

#### `EditorHeader`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/EditorHeader.tsx`
- **Purpose:** Top header bar showing the page title, action links, and autosave status.
- **Props:**
  ```typescript
  interface EditorHeaderProps {
    contentType: EditorContentType;
    mode: "new" | "edit";
    postId?: Id<"posts">;
    status?: PostStatus;
  }
  ```
- **Responsibilities:**
  - Renders `<h1>` with "Add New Post" / "Edit Post" / "Add New Page" / "Edit Page"
  - Shows "View Post" link when status is `"publish"` (opens in new tab)
  - Shows `AutosaveStatusBadge` component
  - Shows keyboard shortcut hint: "Ctrl+S to save"
- **Base UI Dependencies:** None
- **Styling:** `border-b border-border bg-background px-6 py-3`

#### `TitleInput`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/TitleInput.tsx`
- **Purpose:** Large borderless title input field at the top of the main column.
- **Props:**
  ```typescript
  interface TitleInputProps {
    // Reads/writes from EditorForm context
  }
  ```
- **Responsibilities:**
  - Renders a borderless `<input>` with `placeholder="Add title"`, large font size
  - Connects to EditorForm via `form.Field` for the `title` field
  - On blur: triggers slug auto-generation if slug has not been manually edited
  - Max length: 500 characters with visual counter when near limit
  - Auto-focuses on mount for new posts
- **Base UI Dependencies:** `Input` from `@base-ui/react/input` (via project's `Input` component)
- **Styling:** `text-2xl font-semibold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/50`

---

### Metabox Components

#### `MetaboxContainer`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/MetaboxContainer.tsx`
- **Purpose:** Generic wrapper for all metaboxes. Provides collapse/expand toggle, title bar, drag handle, and consistent styling.
- **Props:**
  ```typescript
  interface MetaboxContainerProps {
    id: string;                             // Unique metabox ID for DnD
    title: string;                          // Display title in the header bar
    isDraggable?: boolean;                  // Whether to show drag handle (false for Publish box)
    isCollapsed?: boolean;                  // Controlled collapse state
    onToggleCollapse?: () => void;          // Collapse toggle callback
    actions?: React.ReactNode;              // Optional action buttons in the title bar
    children: React.ReactNode;             // Metabox content
    className?: string;
  }
  ```
- **Responsibilities:**
  - Renders a bordered card with title bar
  - Shows drag handle icon (GripVertical from lucide-react) when `isDraggable` is true
  - Integrates with @dnd-kit's `useSortable` hook for drag-and-drop
  - Collapse/expand with chevron icon animation
  - Applies `data-slot="metabox"` for consistent styling
- **Base UI Dependencies:** None (uses native HTML + Tailwind)
- **Styling:**
  ```
  border border-border bg-card rounded-none
  Title bar: bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider
  Content: px-3 py-3
  Drag handle: text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing
  ```

#### `PublishBox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/PublishBox.tsx`
- **Purpose:** The primary action metabox containing status, visibility, schedule controls, and action buttons. Always first in sidebar, not draggable. Sticky on scroll.
- **Props:**
  ```typescript
  interface PublishBoxProps {
    contentType: EditorContentType;
    mode: "new" | "edit";
    postId?: Id<"posts">;
    userRole: string;                       // Current user's role slug
  }
  ```
- **Responsibilities:**
  - **Status row:** "Status: Draft" with [Edit] link that expands an inline select dropdown
  - **Visibility row:** "Visibility: Public" with [Edit] link that expands radio options (Public, Password-protected with password input, Private)
  - **Schedule row:** "Publish: Immediately" with [Edit] link that expands a date/time picker
  - **Separator line**
  - **Action buttons:**
    - "Save Draft" button (secondary variant) -- visible for draft/auto-draft status
    - "Preview" button (outline variant) -- opens preview in new tab
    - "Publish" button (primary variant) -- or "Update" for already-published posts
    - "Submit for Review" button -- shown to Contributors instead of Publish
  - **Move to Trash** link (destructive text) -- below action buttons, visible to users with delete capability
  - Shows "Published on: {date}" or "Scheduled for: {date}" when applicable
  - Handles "Switch to Draft" action for published posts
- **Base UI Dependencies:**
  - `Select` from `@base-ui/react/select` -- status dropdown
  - `RadioGroup` from `@base-ui/react/radio-group` -- visibility options
  - `Button` from project's `Button` component
  - `Popover` from `@base-ui/react/popover` -- date/time picker wrapper
- **Styling:**
  - Sticky: `sticky top-16 z-10` (stays visible as user scrolls sidebar)
  - Action row: `flex gap-2 items-center justify-between`
  - Primary button: `bg-primary text-primary-foreground`
  - "Move to Trash" link: `text-destructive text-xs hover:underline`
- **Keyboard Shortcuts:**
  - `Ctrl+S` / `Cmd+S` -- triggers Save Draft or Update (handled at EditorLayout level)
  - `Ctrl+Shift+P` / `Cmd+Shift+P` -- triggers Preview

#### `CategoriesMetabox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/CategoriesMetabox.tsx`
- **Purpose:** Hierarchical category checkbox tree with "Add New Category" inline form. Post-type only (hidden for pages).
- **Props:**
  ```typescript
  interface CategoriesMetaboxProps {
    // Reads/writes categoryIds from EditorForm context
  }
  ```
- **Responsibilities:**
  - Renders a scrollable container with nested `CategoryTreeNode` components
  - Each node shows a `Checkbox` with the category name and indentation based on depth
  - "Most Used" tab shows the top 10 categories by post count
  - "All Categories" tab shows the full hierarchical tree
  - "+ Add New Category" link at bottom expands inline form:
    - Text input for category name
    - Parent category dropdown (select from existing)
    - "Add New Category" submit button
    - Creates category via `taxonomy.createTerm` mutation (Taxonomy System)
  - Scrollable container capped at 300px height with overflow-y-auto
- **Data Sources:**
  - `useQuery(api.taxonomy.getCategoryTree)` -- full hierarchical tree
  - `useQuery(api.taxonomy.getByPost, { postId })` -- currently assigned categories (edit mode)
  - `useQuery(api.taxonomy.getMostUsed, { taxonomy: "category", limit: 10 })` -- most used tab
- **Base UI Dependencies:**
  - `Checkbox` from project's `Checkbox` component
  - `Tabs` from `@base-ui/react/tabs`
  - `Select` from `@base-ui/react/select` -- parent category picker
  - `Button` from project's `Button` component
  - `Input` from project's `Input` component
- **Subcomponents:**

  **`CategoryTreeNode`** (internal, recursive)
  ```typescript
  interface CategoryTreeNodeProps {
    category: CategoryNode;
    depth: number;
    selectedIds: string[];
    onToggle: (categoryId: string) => void;
  }
  ```
  - Renders checkbox + label with `pl-{depth * 4}` indentation
  - Recursively renders child categories
  - Handles check/uncheck with parent form state update

#### `TagsMetabox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/TagsMetabox.tsx`
- **Purpose:** Tag input with autocomplete dropdown and removable tag chips. Post-type only (hidden for pages).
- **Props:**
  ```typescript
  interface TagsMetaboxProps {
    // Reads/writes tagIds from EditorForm context
  }
  ```
- **Responsibilities:**
  - Text input with autocomplete suggestions from existing tags
  - Adding a tag: type name and press Enter/comma, or click suggestion
  - Displays assigned tags as chips below the input
  - Each chip has an "x" button to remove the tag
  - Creates new tags on-the-fly if the entered name doesn't match an existing tag
  - "Choose from the most used tags" link shows clickable tag cloud
  - Debounced search (300ms) for autocomplete suggestions
- **Data Sources:**
  - `useQuery(api.taxonomy.searchTerms, { taxonomy: "post_tag", search })` -- autocomplete
  - `useQuery(api.taxonomy.getByPost, { postId })` -- currently assigned tags
  - `useQuery(api.taxonomy.getMostUsed, { taxonomy: "post_tag", limit: 20 })` -- tag cloud
- **Base UI Dependencies:**
  - `Input` from project's `Input` component
  - `Popover` from `@base-ui/react/popover` -- autocomplete dropdown
- **Styling:**
  - Tag chips: `inline-flex items-center gap-1 bg-muted px-2 py-0.5 text-xs rounded-none`
  - Remove button on chip: `text-muted-foreground hover:text-foreground`
  - Tag cloud: `flex flex-wrap gap-1` with tags sized by frequency

#### `FeaturedImageMetabox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/FeaturedImageMetabox.tsx`
- **Purpose:** Featured image preview with Set/Remove controls. Opens an inline MediaPicker panel (NOT a modal).
- **Props:**
  ```typescript
  interface FeaturedImageMetaboxProps {
    // Reads/writes featuredImageId from EditorForm context
  }
  ```
- **Responsibilities:**
  - When no image set: Shows "Set featured image" link
  - When image set: Shows thumbnail preview (aspect ratio preserved, max 100% width)
  - Below thumbnail: "Remove featured image" link
  - Clicking "Set featured image" expands an inline `MediaPicker` panel within the metabox
  - MediaPicker panel shows recent images in a grid, with search and filter, and an upload zone
  - Selecting an image updates `featuredImageId` in form state
  - Gracefully handles missing/deleted media (shows placeholder with "Image not found")
- **Data Sources:**
  - `useQuery(api.media.get, { mediaId: featuredImageId })` -- image data for preview
  - `useQuery(api.media.list, { type: "image", perPage: 20 })` -- media picker grid
- **Base UI Dependencies:**
  - `Button` from project's `Button` component
- **Subcomponents:**

  **`MediaPicker`** (inline panel, NOT a modal)
  ```typescript
  interface MediaPickerProps {
    onSelect: (mediaId: string) => void;
    onClose: () => void;
    selectedId?: string;
    filterType?: "image" | "video" | "audio" | "document";
  }
  ```
  - Grid of media thumbnails
  - Search input
  - Upload zone (drag-and-drop or click to select)
  - "Select" button on each thumbnail

#### `ExcerptMetabox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/ExcerptMetabox.tsx`
- **Purpose:** Plain textarea for entering a manual excerpt.
- **Props:**
  ```typescript
  interface ExcerptMetaboxProps {
    // Reads/writes excerpt from EditorForm context
  }
  ```
- **Responsibilities:**
  - Renders a `<textarea>` with `placeholder="Write a short excerpt (optional)"`
  - Max length: 1000 characters with character count display
  - Help text below: "Excerpts are optional hand-crafted summaries of your content. These are used in your theme and in RSS feeds."
  - Connects to EditorForm via `form.Field` for the `excerpt` field
- **Base UI Dependencies:** None (native `<textarea>` with Tailwind classes)
- **Styling:** `w-full min-h-[80px] resize-y bg-transparent border border-border px-2.5 py-1.5 text-xs`

#### `DiscussionMetabox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/DiscussionMetabox.tsx`
- **Purpose:** Checkbox toggle for enabling/disabling comments on the post.
- **Props:**
  ```typescript
  interface DiscussionMetaboxProps {
    // Reads/writes commentStatus from EditorForm context
  }
  ```
- **Responsibilities:**
  - Renders a `Checkbox` with label "Allow comments"
  - Checked = `commentStatus: "open"`, unchecked = `commentStatus: "closed"`
  - Reads default value from Settings System (`default_comment_status`) for new posts
- **Base UI Dependencies:**
  - `Checkbox` from project's `Checkbox` component
  - `Label` from project's `Label` component
- **Styling:** `flex items-center gap-2`

#### `SlugEditor`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/SlugEditor.tsx`
- **Purpose:** Editable slug field with live permalink preview.
- **Props:**
  ```typescript
  interface SlugEditorProps {
    contentType: EditorContentType;
    // Reads/writes slug from EditorForm context
  }
  ```
- **Responsibilities:**
  - Shows permalink preview: `https://site.com/blog/{slug}` (posts) or `https://site.com/{slug}` (pages)
  - "Edit" button toggles slug into editable mode
  - Auto-sanitizes slug on blur (lowercase, replace spaces with hyphens, strip special chars)
  - Tracks whether slug has been manually edited (prevents auto-regeneration on title change)
  - "OK" and "Cancel" buttons in edit mode
- **Base UI Dependencies:**
  - `Input` from project's `Input` component
  - `Button` from project's `Button` component
- **Styling:** `text-xs text-muted-foreground` for permalink display, editable input matches project Input styling

#### `AuthorSelector`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/AuthorSelector.tsx`
- **Purpose:** Dropdown to reassign the post's author. Only visible to Editors and Administrators.
- **Props:**
  ```typescript
  interface AuthorSelectorProps {
    // Reads/writes authorId from EditorForm context
    userRole: string;
  }
  ```
- **Responsibilities:**
  - Renders a `Select` dropdown populated with users who have `edit_posts` capability
  - Shows user display name (or email fallback) and avatar
  - Only rendered when `userRole` is `"editor"` or `"administrator"`
  - Default value is the current user for new posts
- **Data Sources:**
  - `useQuery(api.users.listAuthors)` -- users with author+ roles
- **Base UI Dependencies:**
  - `Select` from `@base-ui/react/select`
- **Styling:** Matches project Select component patterns

#### `RevisionsMetabox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/RevisionsMetabox.tsx`
- **Purpose:** Shows revision count and provides a link to the revisions comparison page. Only shown in edit mode.
- **Props:**
  ```typescript
  interface RevisionsMetaboxProps {
    postId: Id<"posts">;
    contentType: EditorContentType;
  }
  ```
- **Responsibilities:**
  - Shows "Browse N revisions" as a clickable link (navigates to `/admin/posts/$postId/revisions`)
  - Only rendered when the post has at least 1 revision
  - Revision count updates reactively via Convex subscription
- **Data Sources:**
  - `useQuery(api.revisions.countByPost, { parentId: postId })` -- revision count
- **Base UI Dependencies:** None
- **Styling:** `text-xs text-primary hover:underline cursor-pointer`

#### `SEOMetabox`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/SEOMetabox.tsx`
- **Purpose:** SEO metadata fields: title override, meta description, and search result preview.
- **Props:**
  ```typescript
  interface SEOMetaboxProps {
    postId?: Id<"posts">;
    contentType: EditorContentType;
  }
  ```
- **Responsibilities:**
  - "SEO Title" input -- overrides the post title for search engines
  - "Meta Description" textarea -- custom meta description (max 160 chars with counter)
  - Google search result preview (title, URL, description) that updates as fields change
  - "noindex" checkbox -- exclude from search engines
  - Reads/writes via `postMeta` with keys `_seo_title`, `_seo_description`, `_seo_noindex`
- **Data Sources:**
  - `useQuery(api.postMeta.getByPost, { postId })` -- existing SEO meta values
- **Base UI Dependencies:**
  - `Input` from project's `Input` component
  - `Checkbox` from project's `Checkbox` component
  - `Label` from project's `Label` component
- **Styling:** Google preview card: `border border-border rounded-none p-3 bg-muted/30`

#### `PostEditLockNotice`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/PostEditLockNotice.tsx`
- **Purpose:** Warning banner displayed when another user is currently editing the same post.
- **Props:**
  ```typescript
  interface PostEditLockNoticeProps {
    postId: Id<"posts">;
    currentUserId: string;
  }
  ```
- **Responsibilities:**
  - Polls `_edit_lock` meta value to detect if another user has the lock
  - Shows warning: "{Username} is currently editing this post. If you take over, {username} will be locked out."
  - "Take Over" button (Editor+ only) -- acquires the edit lock
  - "Go Back" button -- navigates back to All Posts
  - Lock expires after 2 minutes of inactivity (no autosave heartbeat)
- **Data Sources:**
  - `useQuery(api.postMeta.getByKey, { postId, key: "_edit_lock" })`
- **Base UI Dependencies:**
  - `Button` from project's `Button` component
- **Styling:** `bg-destructive/10 border border-destructive/30 p-4 text-sm`

#### `AutosaveStatusBadge`

- **Path:** `ConvexPress-Admin/apps/web/src/components/editor/AutosaveStatusBadge.tsx`
- **Purpose:** Small status indicator showing autosave state.
- **Props:**
  ```typescript
  interface AutosaveStatusBadgeProps {
    state: AutosaveState;
  }
  ```
- **Responsibilities:**
  - "Saved" -- text-muted-foreground (idle, no unsaved changes)
  - "Unsaved changes" -- text-foreground with subtle warning dot (dirty form)
  - "Saving..." -- text-muted-foreground with pulse animation
  - "Autosaved at {time}" -- text-muted-foreground with relative time
  - "Error saving" -- text-destructive
- **Styling:** `text-xs text-muted-foreground` base, with semantic color variants

---

## Hooks

### `useEditorForm`

- **Path:** `ConvexPress-Admin/apps/web/src/hooks/useEditorForm.ts`
- **Purpose:** Initializes and manages the TanStack Form instance for the post/page editor with Zod validation.
- **Signature:**
  ```typescript
  function useEditorForm(options: {
    contentType: EditorContentType;
    mode: "new" | "edit";
    postId?: Id<"posts">;
    initialData?: Partial<EditorFormValues>;
    defaultCommentStatus?: CommentStatus;
  }): {
    form: FormApi<EditorFormValues>;
    isDirty: boolean;
    isSubmitting: boolean;
    handleSaveDraft: () => Promise<void>;
    handlePublish: () => Promise<void>;
    handleUpdate: () => Promise<void>;
    handleSubmitForReview: () => Promise<void>;
    handleSchedule: (date: Date) => Promise<void>;
    handleTrash: () => Promise<void>;
    resetForm: (data: EditorFormValues) => void;
  }
  ```
- **Behavior:**
  - Creates a TanStack Form with Zod validation schema
  - Initializes form values from post data (edit mode) or defaults (new mode)
  - Provides mutation wrappers: saveDraft calls `posts.update` with `status: "draft"`, publish calls `posts.publish`, etc.
  - Tracks dirty state from both form fields and content editor changes
  - Returns helpers for each action button in the Publish Box
- **Zod Validation Schema:**
  ```typescript
  const editorFormSchema = z.object({
    title: z.string().max(500, "Title must be 500 characters or less"),
    slug: z.string().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format"),
    content: z.string(),
    excerpt: z.string().max(1000, "Excerpt must be 1000 characters or less").optional(),
    status: z.enum(["auto-draft", "draft", "pending", "publish", "future", "private", "trash"]),
    visibility: z.enum(["public", "private", "password"]),
    password: z.string().min(1, "Password required for protected posts").optional(),
    commentStatus: z.enum(["open", "closed"]),
    isSticky: z.boolean(),
    featuredImageId: z.string().nullable(),
    authorId: z.string(),
    scheduledFor: z.date().nullable(),
    categoryIds: z.array(z.string()),
    tagIds: z.array(z.string()),
    menuOrder: z.number().int(),
  }).refine(
    (data) => data.visibility !== "password" || (data.password && data.password.length > 0),
    { message: "Password is required for password-protected posts", path: ["password"] }
  );
  ```

### `useAutosave`

- **Path:** `ConvexPress-Admin/apps/web/src/hooks/useAutosave.ts`
- **Purpose:** Manages debounced autosave of post content and title.
- **Signature:**
  ```typescript
  function useAutosave(options: {
    postId: Id<"posts"> | null;
    title: string;
    content: string;
    enabled: boolean;
    debounceMs?: number;             // Default: 2000 (2s after typing stops)
    intervalMs?: number;             // Default: 60000 (60s periodic)
  }): AutosaveState;
  ```
- **Behavior:**
  - Watches `title` and `content` for changes
  - After `debounceMs` of no changes, calls `posts.autosave` mutation
  - Also fires on a periodic `intervalMs` interval if there are pending changes
  - Returns current autosave state (idle, saving, saved, error)
  - Clears autosave timer on unmount
  - Does NOT autosave if `postId` is null (auto-draft not yet created)
  - Does NOT autosave if `enabled` is false (e.g., form is submitting)

### `useMetaboxOrder`

- **Path:** `ConvexPress-Admin/apps/web/src/hooks/useMetaboxOrder.ts`
- **Purpose:** Manages metabox ordering, collapse state, and visibility preferences. Persisted to localStorage.
- **Signature:**
  ```typescript
  function useMetaboxOrder(options: {
    contentType: EditorContentType;
    userRole: string;
  }): {
    metaboxes: MetaboxConfig[];
    moveMetabox: (activeId: string, overId: string) => void;
    toggleCollapse: (metaboxId: string) => void;
    toggleVisibility: (metaboxId: string) => void;
    resetToDefaults: () => void;
    sensors: SensorDescriptor<SensorOptions>[];
  }
  ```
- **Behavior:**
  - Loads preferences from `localStorage` key `convexpress_metabox_prefs_{contentType}`
  - Falls back to `DEFAULT_POST_METABOXES` or `DEFAULT_PAGE_METABOXES`
  - Provides @dnd-kit sensor configuration (pointer + keyboard)
  - Filters out metaboxes the user's role cannot access (e.g., Author dropdown for non-editors)
  - Persists changes to localStorage on every modification
  - `moveMetabox` handles @dnd-kit's `onDragEnd` event

### `useEditorKeyboardShortcuts`

- **Path:** `ConvexPress-Admin/apps/web/src/hooks/useEditorKeyboardShortcuts.ts`
- **Purpose:** Registers global keyboard shortcuts for the editor page.
- **Signature:**
  ```typescript
  function useEditorKeyboardShortcuts(options: {
    onSave: () => void;
    onPreview: () => void;
    enabled: boolean;
  }): void;
  ```
- **Behavior:**
  - `Ctrl+S` / `Cmd+S` -- calls `onSave` (Save Draft or Update depending on status)
  - `Ctrl+Shift+P` / `Cmd+Shift+P` -- calls `onPreview`
  - Prevents default browser save dialog
  - Disabled during form submission or when `enabled` is false

### `useUnsavedChangesWarning`

- **Path:** `ConvexPress-Admin/apps/web/src/hooks/useUnsavedChangesWarning.ts`
- **Purpose:** Registers `beforeunload` event and TanStack Router navigation blocking when form is dirty.
- **Signature:**
  ```typescript
  function useUnsavedChangesWarning(options: {
    isDirty: boolean;
    enabled: boolean;
  }): void;
  ```
- **Behavior:**
  - When `isDirty` is true and `enabled` is true:
    - Registers `window.addEventListener("beforeunload", handler)` with `e.preventDefault()`
    - Uses TanStack Router's `useBlocker` to show confirmation dialog on SPA navigation
  - Cleans up on unmount

---

## Routes

### Add New Post -- `/admin/posts/new`

- **Route File:** `ConvexPress-Admin/apps/web/src/routes/_admin/posts/new.tsx`
- **Purpose:** Create a new blog post with editor layout
- **Auth Required:** Yes (requires `edit_posts` capability)
- **Behavior:**
  1. On mount: Creates an auto-draft via `posts.create({ status: "auto-draft" })` mutation
  2. After auto-draft created: Initializes `EditorLayout` with empty form values and the new `postId`
  3. Shows loading skeleton while auto-draft is being created
  4. After publish: Redirects to `/admin/posts/$postId/edit` via `router.navigate`
- **Components Used:** `EditorLayout`, all sidebar metaboxes, `ContentEditor` (from Content Editor System)
- **Data Loaders:** None (creates auto-draft on mount)

### Edit Post -- `/admin/posts/$postId/edit`

- **Route File:** `ConvexPress-Admin/apps/web/src/routes/_admin/posts/$postId/edit.tsx`
- **Purpose:** Edit an existing blog post
- **Auth Required:** Yes (requires `edit_posts` for own, `edit_others_posts` for others')
- **Behavior:**
  1. Route param: `$postId` parsed as `Id<"posts">`
  2. Loads post data via `useQuery(api.posts.get, { postId })`
  3. If post not found: Show 404 message with link back to All Posts
  4. If post is in trash: Show warning with "Restore" link
  5. Acquires edit lock via `postMeta.set({ key: "_edit_lock", ... })`
  6. Initializes `EditorLayout` with post data
  7. On unmount: Releases edit lock
- **Components Used:** Same as Add New Post, plus `RevisionsMetabox` and `PostEditLockNotice`
- **Data Loaders:** `posts.get`, `postMeta.getByPost`, `taxonomy.getByPost`, `revisions.countByPost`

### Add New Page -- `/admin/pages/new`

- **Route File:** `ConvexPress-Admin/apps/web/src/routes/_admin/pages/new.tsx`
- **Purpose:** Create a new page (same layout as posts, different metabox set)
- **Auth Required:** Yes (requires `edit_pages` capability)
- **Behavior:** Same as Add New Post but with `contentType: "page"`. No CategoriesMetabox or TagsMetabox. Includes PageAttributesMetabox (parent page dropdown + menu order).

### Edit Page -- `/admin/pages/$pageId/edit`

- **Route File:** `ConvexPress-Admin/apps/web/src/routes/_admin/pages/$pageId/edit.tsx`
- **Purpose:** Edit an existing page
- **Auth Required:** Yes (requires `edit_pages` for own, `edit_others_pages` for others')
- **Behavior:** Same as Edit Post but with `contentType: "page"`.

---

## Backend Integration

This expert NEVER defines Convex functions. It consumes functions defined by backend system experts.

### Queries Used

| Query | System Owner | Used By | Purpose |
|-------|-------------|---------|---------|
| `posts.get` | Post System | EditorLayout, PublishBox | Load post data for editing |
| `posts.create` | Post System | Add New route | Create auto-draft |
| `posts.update` | Post System | useEditorForm | Save changes |
| `posts.publish` | Post System | useEditorForm | Publish post |
| `posts.unpublish` | Post System | PublishBox | Switch to draft |
| `posts.schedule` | Post System | PublishBox | Schedule future publish |
| `posts.trash` | Post System | PublishBox | Move to trash |
| `posts.autosave` | Post System | useAutosave | Background autosave |
| `postMeta.getByPost` | Post System | SEOMetabox, CustomFieldsMetabox | Load metadata |
| `postMeta.set` | Post System | SEOMetabox, PostEditLockNotice | Set metadata |
| `taxonomy.getCategoryTree` | Taxonomy System | CategoriesMetabox | Category hierarchy |
| `taxonomy.getByPost` | Taxonomy System | CategoriesMetabox, TagsMetabox | Assigned terms |
| `taxonomy.searchTerms` | Taxonomy System | TagsMetabox | Tag autocomplete |
| `taxonomy.getMostUsed` | Taxonomy System | CategoriesMetabox, TagsMetabox | Popular terms |
| `taxonomy.createTerm` | Taxonomy System | CategoriesMetabox | Add new category inline |
| `taxonomy.assign` | Taxonomy System | useEditorForm (on save) | Assign terms to post |
| `taxonomy.unassign` | Taxonomy System | useEditorForm (on save) | Remove terms from post |
| `media.get` | Media System | FeaturedImageMetabox | Featured image preview |
| `media.list` | Media System | FeaturedImageMetabox (MediaPicker) | Media library grid |
| `media.upload` | Media System | FeaturedImageMetabox (MediaPicker) | Upload new image |
| `users.listAuthors` | User Profile System | AuthorSelector | Author dropdown options |
| `revisions.countByPost` | Revision System | RevisionsMetabox | Revision count |
| `settings.get` | Settings System | useEditorForm | Default comment status |
| `customFields.getGroupsForContext` | Custom Field System | EditorLayout | Location rule matching |
| `customFields.getAllValues` | Custom Field System | CustomFieldsMetabox | Field values |
| `customFields.setValues` | Custom Field System | useEditorForm (on save) | Save field values |

---

## Accessibility

### Keyboard Navigation

| Key | Action | Context |
|-----|--------|---------|
| `Tab` | Move between form fields, metaboxes, and buttons | Entire editor |
| `Shift+Tab` | Move backwards | Entire editor |
| `Space` | Toggle checkbox, activate button | Checkboxes, buttons |
| `Enter` | Submit inline forms (new category, tag), activate links | Forms, links |
| `Escape` | Close expanded edit sections in Publish Box, cancel slug edit | Inline editors |
| `Ctrl+S` / `Cmd+S` | Save Draft / Update | Global shortcut |
| `Ctrl+Shift+P` / `Cmd+Shift+P` | Preview | Global shortcut |
| `Arrow Up/Down` | Navigate autocomplete suggestions, category tree | TagsMetabox, CategoriesMetabox |

### ARIA Roles & Labels

| Element | ARIA | Purpose |
|---------|------|---------|
| EditorLayout | `role="main"` + `aria-label="Post editor"` | Landmark |
| MetaboxContainer | `role="region"` + `aria-label="{metabox title}"` | Collapsible regions |
| Collapse toggle | `aria-expanded="{state}"` + `aria-controls="{content-id}"` | Collapsible state |
| Drag handle | `aria-roledescription="sortable"` + `aria-label="Reorder {metabox title}"` | DnD handle |
| Category tree | `role="tree"` | Hierarchical structure |
| Category node | `role="treeitem"` + `aria-expanded` (if has children) | Tree items |
| Tag chips | `role="list"` (container) + `role="listitem"` (each chip) | Tag list |
| Tag remove button | `aria-label="Remove tag: {name}"` | Destructive action |
| Status select | `aria-label="Post status"` | Form control |
| Visibility radios | `aria-label="Post visibility"` | Form control |
| Publish button | `aria-label="Publish post"` or `aria-label="Update post"` | Primary action |
| Autosave badge | `role="status"` + `aria-live="polite"` | Live update region |
| Edit lock notice | `role="alert"` | Critical warning |

### Focus Management

- On page load (new post): Focus moves to the TitleInput
- On page load (edit post): Focus moves to the TitleInput
- After publishing: Focus moves to success toast (managed by Sonner)
- On edit lock warning: Focus moves to the warning banner
- After adding a category: Focus returns to the "Add New Category" input
- After removing a tag: Focus returns to the tag input
- Metabox collapse/expand: Focus stays on the toggle button

---

## Known Gaps & Decisions

### 1. Metabox Drag-and-Drop Library Choice

**Decision:** Use `@dnd-kit/core` + `@dnd-kit/sortable` for metabox reordering.

**Rationale:**
- Framework-agnostic, works with React 18+
- Built-in keyboard and screen reader accessibility
- Lightweight (~14kb gzipped for core + sortable)
- Well-maintained and actively developed
- Supports both pointer and keyboard sensors

**Implementation:**
```typescript
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

### 2. Sticky Publish Box Implementation

**Decision:** Use CSS `position: sticky` with `top: 4rem` (matches admin bar height).

**Rationale:**
- Pure CSS solution, no JavaScript scroll listeners needed
- Native browser support is excellent (>97% global)
- Works within the sidebar overflow container
- Falls back gracefully (just scrolls normally if unsupported)

**Implementation:**
```css
/* PublishBox sticky positioning */
.publish-box {
  position: sticky;
  top: 4rem; /* 64px - matches admin bar height */
  z-index: 10;
}
```

**Gotcha:** The sidebar column must NOT have `overflow: hidden` on any ancestor, or sticky positioning breaks. Use `overflow-y: auto` on the sidebar's scrollable area below the sticky Publish box.

### 3. Autosave Visual Indicator Design

**Decision:** Use an `AutosaveStatusBadge` component in the EditorHeader with the following states:

| State | Display | Style |
|-------|---------|-------|
| Idle (no changes) | "Saved" | `text-muted-foreground` |
| Dirty (unsaved changes) | "Unsaved changes" | `text-foreground` (with subtle amber dot indicator) |
| Saving | "Saving..." | `text-muted-foreground` with pulsing opacity animation |
| Saved (after autosave) | "Autosaved at 2:34 PM" | `text-muted-foreground` (briefly shows `text-primary` then fades) |
| Error | "Error saving" | `text-destructive` |

The badge uses `role="status"` and `aria-live="polite"` for screen reader announcements.

### 4. Unsaved Changes Detection Strategy

**Decision:** Use TanStack Form's built-in `isDirty` property combined with a content hash for the block editor.

**Rationale:**
- TanStack Form tracks dirty state for all controlled fields (title, excerpt, categories, tags, etc.)
- The block editor content is outside TanStack Form's control (managed by TipTap), so we compare a SHA-256 hash of `editor.getJSON()` against the last-saved hash
- Combined dirty state: `formIsDirty || contentHashChanged`
- This avoids false positives from TipTap's internal state changes that don't affect content

**Implementation:**
```typescript
const contentHash = useMemo(
  () => hashContent(editor?.getJSON()),
  [editor?.getJSON()]
);
const isDirty = form.state.isDirty || contentHash !== savedContentHash;
```

### 5. Mobile Editor Layout

**Decision:** Single-column stacked layout with metaboxes below the content editor.

**Rationale:**
- Tabs add complexity and hide important controls
- WordPress mobile uses single-column stacked (proven pattern)
- Metaboxes collapse by default on mobile to save space
- Publish box moves to bottom of screen as a fixed footer bar on mobile

**Implementation:**
- Breakpoint: `lg:` (1024px) for two-column layout
- Below `lg`: Single column, sidebar metaboxes stack below content
- Mobile Publish footer: Fixed `bottom-0` bar with "Save Draft" and "Publish" buttons only
- The full Publish box remains in the stacked layout for detailed options

### 6. Date/Time Picker for Scheduling

**Decision:** Use a custom date/time picker built with @base-ui/react Popover + native `<input type="date">` and `<input type="time">`.

**Rationale:**
- @base-ui/react does not include a date picker component
- Native date/time inputs provide accessibility and mobile support for free
- Wrapped in a Popover for the "Edit" toggle pattern in the Publish box
- Custom formatting for display (locale-aware)

### 7. Custom Fields Metabox Integration

**Decision:** Render custom field group metaboxes dynamically based on location rules from the Custom Field System.

**Implementation:**
- `EditorLayout` queries `customFields.getGroupsForContext` with the current post type, template, categories, etc.
- For each matching field group with `position: "sidebar"`, render a `CustomFieldGroupMetabox`
- For groups with `position: "normal"`, render below the content editor in the main column
- Field group metaboxes are draggable and included in metabox ordering
- The Custom Field System Expert provides the `CustomFieldGroupMetabox` component

### 8. Page Attributes Metabox (Pages Only)

**Decision:** Pages get a "Page Attributes" metabox with parent page dropdown and menu order input.

**Implementation:**
- Parent page dropdown: Shows all published pages in a hierarchical tree
- Menu order: Numeric input for custom ordering
- This metabox replaces Categories and Tags metaboxes for pages

---

## Dependencies

### Depends On (Systems This Expert Consumes)

| System | Dependency Type | What We Use |
|--------|----------------|-------------|
| **Post System** | Hard | `posts.get`, `posts.create`, `posts.update`, `posts.publish`, `posts.autosave`, `posts.trash`, `postMeta.*` |
| **Page System** | Hard | `pages.get`, `pages.create`, `pages.update`, `pages.publish`, `pages.trash` (same shape as Post System) |
| **Content Editor System** | Hard | `ContentEditor` component (TipTap block editor rendered in main column) |
| **Taxonomy System** | Hard | `taxonomy.getCategoryTree`, `taxonomy.getByPost`, `taxonomy.searchTerms`, `taxonomy.getMostUsed`, `taxonomy.createTerm`, `taxonomy.assign`, `taxonomy.unassign` |
| **Media System** | Hard | `media.get` (featured image preview), `media.list` (media picker), `media.upload` (inline upload) |
| **Custom Field System** | Hard | `customFields.getGroupsForContext`, `customFields.getAllValues`, `customFields.setValues` |
| **Revision System** | Medium | `revisions.countByPost` (revision count in metabox) |
| **SEO System** | Medium | `postMeta` keys `_seo_title`, `_seo_description`, `_seo_noindex` (SEO metabox reads/writes via Post System's postMeta) |
| **User Profile System** | Soft | `users.listAuthors` (author dropdown) |
| **Settings System** | Soft | `settings.get` for `default_comment_status`, `default_category` |
| **Role & Capability System** | Soft | Capability checks for conditional UI rendering (via user's role) |
| **Admin Shell & Navigation UI** | Soft | Admin bar height for sticky Publish box offset, sidebar layout context |

### Depended On By

| System | Dependency Type | Details |
|--------|----------------|---------|
| **Post System** | Hard | Post editor screens use this layout |
| **Page System** | Hard | Page editor screens use this layout |
| **Custom Field System** | Medium | Custom field group metaboxes are rendered within this layout |

### Package Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `@base-ui/react` | Interactive UI primitives (Select, Checkbox, Tabs, Popover, RadioGroup, Combobox) | Latest |
| `@dnd-kit/core` | Drag-and-drop context and sensors | ^6.x |
| `@dnd-kit/sortable` | Sortable list primitives for metabox reordering | ^8.x |
| `@dnd-kit/utilities` | CSS transform utilities | ^3.x |
| `@tanstack/react-form` | Form state management with Zod validation | Latest |
| `zod` | Form validation schema | Latest |
| `lucide-react` | Icons (GripVertical, ChevronDown, ChevronUp, X, Image, Calendar, Eye, Lock, Globe, Pencil, etc.) | Latest |
| `sonner` | Toast notifications (success on publish, warning on trash) | Latest |
| `clsx` | Conditional class name joining | Latest |
| `class-variance-authority` | Component variant definitions | Latest |
| `tailwind-merge` | Tailwind class deduplication | Latest |

---

## Implementation Checklist

### Components

- [ ] `src/components/editor/EditorLayout.tsx` -- Root layout with two-column grid + DndContext
- [ ] `src/components/editor/EditorHeader.tsx` -- Header bar with title + autosave badge
- [ ] `src/components/editor/TitleInput.tsx` -- Large borderless title input
- [ ] `src/components/editor/MetaboxContainer.tsx` -- Generic metabox wrapper (drag, collapse, title)
- [ ] `src/components/editor/PublishBox.tsx` -- Status, visibility, schedule, action buttons
- [ ] `src/components/editor/CategoriesMetabox.tsx` -- Category checkbox tree + add new
- [ ] `src/components/editor/TagsMetabox.tsx` -- Tag input with autocomplete + chips
- [ ] `src/components/editor/FeaturedImageMetabox.tsx` -- Image preview + MediaPicker
- [ ] `src/components/editor/MediaPicker.tsx` -- Inline media selection panel (NOT a modal)
- [ ] `src/components/editor/ExcerptMetabox.tsx` -- Excerpt textarea
- [ ] `src/components/editor/DiscussionMetabox.tsx` -- Comment status toggle
- [ ] `src/components/editor/SlugEditor.tsx` -- Editable slug with permalink preview
- [ ] `src/components/editor/AuthorSelector.tsx` -- Author dropdown (Editor+ only)
- [ ] `src/components/editor/RevisionsMetabox.tsx` -- Revision count + browse link
- [ ] `src/components/editor/SEOMetabox.tsx` -- SEO title, description, preview
- [ ] `src/components/editor/PostEditLockNotice.tsx` -- Concurrent editing warning
- [ ] `src/components/editor/AutosaveStatusBadge.tsx` -- Autosave state indicator
- [ ] `src/components/editor/PageAttributesMetabox.tsx` -- Parent page + menu order (pages only)

### Hooks

- [ ] `src/hooks/useEditorForm.ts` -- TanStack Form + Zod + mutation wrappers
- [ ] `src/hooks/useAutosave.ts` -- Debounced autosave logic
- [ ] `src/hooks/useMetaboxOrder.ts` -- Metabox ordering + localStorage persistence
- [ ] `src/hooks/useEditorKeyboardShortcuts.ts` -- Ctrl+S, Ctrl+Shift+P
- [ ] `src/hooks/useUnsavedChangesWarning.ts` -- beforeunload + TanStack Router blocker

### Routes

- [ ] `src/routes/_admin/posts/new.tsx` -- Add New Post
- [ ] `src/routes/_admin/posts/$postId/edit.tsx` -- Edit Post
- [ ] `src/routes/_admin/pages/new.tsx` -- Add New Page
- [ ] `src/routes/_admin/pages/$pageId/edit.tsx` -- Edit Page

### Types

- [ ] `src/types/editor.ts` -- All editor-related TypeScript types and constants

---

## Edge Cases & Gotchas

1. **Auto-draft orphans:** If user navigates away from "Add New Post" without saving, the auto-draft persists. The Post System's trash auto-purge should handle old auto-drafts (older than 7 days). The editor should check for existing auto-drafts before creating a new one.

2. **Concurrent category creation:** Two admins add a category with the same name simultaneously. The Taxonomy System handles slug uniqueness; the editor should handle the "CONFLICT" error gracefully and refetch the category tree.

3. **Featured image deleted elsewhere:** User A sets a featured image; User B deletes that media item. User A's editor should handle the dangling reference by showing a "Image not found" placeholder and allowing the user to select a new image.

4. **Browser tab crash during autosave:** If the browser crashes during an autosave, the partially-saved data is fine because Convex mutations are transactional. On next load, the editor detects `autosaveContent` newer than `content` and offers recovery.

5. **Very long content performance:** The TipTap editor handles large documents well, but the autosave hash comparison can be expensive for very long posts. Consider throttling the hash computation or using a simpler dirty flag from TipTap's `onUpdate` callback.

6. **Slug conflicts on publish:** If the auto-generated slug conflicts with an existing published post, the backend appends a suffix. The editor should show the final slug after save/publish.

7. **Schedule date in the past:** If the user selects a past date in the schedule picker, show a validation error inline. The backend also validates this.

8. **Password visibility toggle:** When visibility is set to "Password", the password input should show/hide toggle. Passwords should never be displayed in plain text without user action.

9. **Mobile Publish footer overlap:** The fixed footer bar on mobile must not overlap the bottom of the content editor. Add bottom padding to the editor area equal to the footer height.

10. **Metabox order migration:** If new metaboxes are added in future versions, the localStorage-persisted order should gracefully merge new metaboxes into the user's existing order (append to end).

---

## Styling Reference

### Color Variables Used (NEVER hardcoded)

| Purpose | Variable | Usage |
|---------|----------|-------|
| Card backgrounds | `bg-card` | Metabox backgrounds |
| Muted backgrounds | `bg-muted` | Metabox title bars, tag chips |
| Borders | `border-border` | Metabox borders, input borders |
| Primary actions | `bg-primary`, `text-primary-foreground` | Publish/Update button |
| Destructive | `text-destructive`, `bg-destructive/10` | Trash link, error states |
| Muted text | `text-muted-foreground` | Help text, labels, timestamps |
| Foreground | `text-foreground` | Primary text content |
| Input styling | `border-input`, `bg-input/30` | Form inputs (dark mode) |
| Focus rings | `ring-ring/50`, `border-ring` | Focus states |
| Opacity overlays | `bg-black/40`, `bg-black/60` | Overlay backgrounds |

### Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Border radius | `rounded-none` | All elements (sharp corners, per project convention) |
| Text size (default) | `text-xs` | All body text, labels, inputs |
| Text size (title) | `text-2xl` | Post/page title input |
| Text size (metabox title) | `text-xs font-semibold uppercase tracking-wider` | Metabox header bars |
| Spacing | `px-3 py-2` (metabox header), `px-3 py-3` (metabox content) | Consistent metabox padding |
| Sidebar width | `340px` on `lg:` breakpoint | Fixed sidebar width |
| Sticky offset | `top-16` (4rem / 64px) | Publish box sticky position |

---

## WordPress Functions Reference

| WordPress | ConvexPress Equivalent | Notes |
|-----------|----------------------|-------|
| `add_meta_box()` | `MetaboxContainer` component | Declarative React vs PHP callback registration |
| `do_meta_boxes()` | `EditorLayout` sidebar rendering | Component composition vs PHP function |
| `wp_nonce_field()` | Convex Auth JWT (automatic) | Auth handled by Convex + Convex Auth |
| `wp_editor()` | `ContentEditor` from Content Editor System | TipTap vs TinyMCE/Gutenberg |
| `post_submit_meta_box()` | `PublishBox` component | Status, visibility, schedule, actions |
| `post_categories_meta_box()` | `CategoriesMetabox` component | React tree vs PHP walker |
| `post_tags_meta_box()` | `TagsMetabox` component | React controlled input vs jQuery tagBox |
| `post_thumbnail_meta_box()` | `FeaturedImageMetabox` component | Inline picker vs wp.media modal |
| `post_excerpt_meta_box()` | `ExcerptMetabox` component | Direct equivalent |
| `post_comment_status_meta_box()` | `DiscussionMetabox` component | Direct equivalent |
| `get_sample_permalink_html()` | `SlugEditor` component | Client-side slug editing |
| `post_author_meta_box()` | `AuthorSelector` component | Direct equivalent |
| `wp_check_post_lock()` | `PostEditLockNotice` component | Reactive check vs AJAX poll |
| `Screen Options` | `useMetaboxOrder` hook + localStorage | Client-side preferences vs server-side user meta |
