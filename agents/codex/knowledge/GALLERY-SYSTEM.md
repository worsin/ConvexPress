# Gallery System - Implementation Specification

**System:** Gallery System
**Status:** Planned
**Priority:** P1 - High
**Complexity:** Complex
**Layer:** Full Stack
**WordPress Equivalent:** NextGEN Gallery + core Media Library + shortcode/block embedding
**Last Authored:** 2026-04-06

---

## Intent

The Gallery System is a first-class ConvexPress plugin for managing image albums built on top of the existing Media System. It allows administrators and editors to assemble albums from media-library assets, organize those albums into categories, publish standalone gallery pages, and embed albums inside pages and posts.

This system must feel familiar to WordPress users while staying aligned with ConvexPress architecture:

- `ConvexPress-Admin/` owns all schema, Convex functions, settings, and admin UI.
- `ConvexPress-Website/` is a consumer that renders public gallery pages and embedded albums.
- The existing Media System remains the source of truth for image files, derivatives, metadata, and storage.
- The gallery plugin is enabled/disabled through the shared plugin registry and settings system.

The system must support both:

- a **native editor block** for albums
- a **shortcode compatibility layer** for `[album ...]`

The block is the primary authoring path. The shortcode is a secondary compatibility path for power users, migrations, and reusable content.

---

## Product Goals

1. Create and manage albums from existing media-library items.
2. Organize albums by category.
3. Publish albums as standalone website pages.
4. Embed albums into pages/posts with a first-class editor block.
5. Support shortcode-based embedding for compatibility.
6. Present images in a polished, accessible lightbox/modal experience.
7. Enforce plugin gating, visibility, and permissions consistently across admin and website.
8. Scale to large albums without degrading page performance.

---

## Non-Goals For V1

- User-generated frontend uploads
- Ecommerce, licensing, or print fulfillment
- Video gallery management
- Per-image public comments
- Arbitrary custom shortcode framework
- Deep taxonomy hierarchy beyond basic album categories
- Watermarking or destructive image editing
- ZIP export/download bundles

These can be added later, but they should not complicate the initial delivery.

---

## Architectural Position

### What This System Owns

- album records
- album categories
- ordered album-item relationships
- gallery plugin settings
- public album query layer
- album embed rendering
- album lightbox behavior

### What This System Does Not Own

- raw file upload/storage
- derivative generation
- media metadata extraction
- page/post persistence
- generic shortcode infrastructure

Those remain owned by the Media System, Post System, Page System, and Content Editor System.

---

## Plugin Integration

The Gallery System is a plugin, not a hardcoded core feature.

### Plugin Registry Changes

Add a new plugin entry in:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Proposed plugin definition:

- `id`: `gallery`
- `title`: `Image Galleries`
- `settingsKey`: `galleryEnabled`
- `navSectionIds`: `["gallery"]`
- `adminAccessPrefixes`: `["/admin/gallery"]`
- `routePrefixes`: `["/gallery"]`

### Shared Settings Changes

Extend the `plugins` settings section with:

- `galleryEnabled: boolean`

This must be added to:

- backend settings defaults
- backend settings validators
- plugin management UI
- plugin gating helpers

### Required Public Gating Rule

The Gallery System must set a stronger standard than some existing plugin-backed public systems:

- if `galleryEnabled === false`, public queries must not return gallery content
- website routes under `/gallery` must not render public albums
- embedded albums and shortcodes must fail closed

Failure behavior should be:

- public website: render nothing or a safe "content unavailable" fallback
- admin preview: show a clear disabled-plugin notice

---

## Data Model

The media library remains canonical. Albums reference media items; they do not duplicate image files.

### `gallery_albums`

Purpose: the main album entity.

Recommended fields:

- `title: string`
- `slug: string`
- `description?: string`
- `excerpt?: string`
- `status: "draft" | "publish" | "private" | "trash" | "future"`
- `visibility: "public" | "private" | "password"`
- `password?: string`
- `coverMediaId?: Id<"media">`
- `layoutPreset: "grid" | "masonry" | "justified" | "carousel"`
- `columnsDesktop?: number`
- `columnsTablet?: number`
- `columnsMobile?: number`
- `thumbnailCrop: "square" | "landscape" | "portrait" | "natural"`
- `lightboxEnabled: boolean`
- `captionsEnabled: boolean`
- `downloadEnabled: boolean`
- `sortMode: "manual" | "dateAsc" | "dateDesc" | "titleAsc" | "titleDesc"`
- `itemCount: number`
- `authorId: string`
- `seoTitle?: string`
- `seoDescription?: string`
- `publishedAt?: number`
- `scheduledAt?: number`
- `createdAt: number`
- `updatedAt: number`
- `trashedAt?: number`

Recommended indexes:

- `by_slug`
- `by_status`
- `by_status_publishedAt`
- `by_author`
- `by_createdAt`

### `gallery_albumItems`

Purpose: ordered membership of media items within albums.

Recommended fields:

- `albumId: Id<"gallery_albums">`
- `mediaId: Id<"media">`
- `sortOrder: number`
- `captionOverride?: string`
- `altTextOverride?: string`
- `linkUrl?: string`
- `focusX?: number`
- `focusY?: number`
- `createdAt: number`
- `updatedAt: number`

Recommended indexes:

- `by_album_sortOrder`
- `by_media`
- `by_album_media`

This table is intentionally separate so the system can support:

- drag-and-drop ordering
- per-image caption overrides
- per-image alt text overrides
- future item-level controls without rewriting album documents

### `gallery_categories`

Purpose: album categorization for archives and filtering.

Recommended fields:

- `name: string`
- `slug: string`
- `description?: string`
- `isPublished: boolean`
- `sortOrder: number`
- `createdAt: number`
- `updatedAt: number`

Recommended indexes:

- `by_slug`
- `by_published_sortOrder`

### Category Relationship

Choose one of these upfront:

1. **Single category per album**
   - simpler queries
   - easier admin UX
   - fewer relationships

2. **Many-to-many categories**
   - more flexible
   - better parity with WordPress-like taxonomy expectations

Recommended: **many-to-many** for long-term flexibility via:

- `gallery_albumCategoryLinks`
  - `albumId`
  - `categoryId`
  - indexes on `by_album`, `by_category`, `by_album_category`

---

## Permissions

Add gallery-specific capabilities to the capability system:

- `gallery.view`
- `gallery.create`
- `gallery.edit`
- `gallery.editOwn`
- `gallery.delete`
- `gallery.publish`
- `gallery.manageCategories`

Suggested role behavior:

- Administrator: all
- Editor: all except maybe destructive global deletes depending on policy
- Author: create/edit own albums only if desired
- Contributor: none in v1 unless explicitly needed

### Public Access Rules

- `publish + public` albums are visible to everyone
- `private` albums require authenticated user with explicit permission
- `password` albums require password gate
- `draft`, `trash`, disabled plugin, and missing-media states must never leak content publicly

---

## Backend Function Surface

All gallery functions live in:

- `ConvexPress-Admin/packages/backend/convex/gallery/`

### Queries

Admin queries:

- `gallery.albums.list`
- `gallery.albums.get`
- `gallery.albums.getEditorState`
- `gallery.categories.list`
- `gallery.categories.get`

Public queries:

- `gallery.public.listPublished`
- `gallery.public.getBySlug`
- `gallery.public.getEmbed`
- `gallery.public.listByCategory`
- `gallery.public.getCategoryArchive`

Internal helpers:

- `gallery.internals.isGalleryEnabled`
- `gallery.internals.resolveAlbumItems`
- `gallery.internals.resolveCoverMedia`
- `gallery.internals.computeAlbumCounts`

### Mutations

- `gallery.albums.create`
- `gallery.albums.update`
- `gallery.albums.delete`
- `gallery.albums.publish`
- `gallery.albums.reorderItems`
- `gallery.albums.addItems`
- `gallery.albums.removeItem`
- `gallery.categories.create`
- `gallery.categories.update`
- `gallery.categories.delete`

### Actions

V1 can likely avoid gallery-specific actions, because media processing is already owned elsewhere.

Actions are only needed if later adding:

- batch ZIP generation
- watermarking
- external sync

---

## Admin UX

### Routes

Add admin routes under:

- `/gallery`
- `/gallery/albums`
- `/gallery/albums/$albumId`
- `/gallery/categories`
- `/gallery/settings`

### Albums List

Columns:

- Title
- Status
- Category count
- Image count
- Cover thumbnail
- Updated at
- Author
- Actions

Capabilities:

- filter by status
- filter by category
- search by title/slug
- bulk publish/unpublish/trash

### Album Edit Screen

Sections:

1. Publish/status box
2. Slug/permalink
3. Description/excerpt
4. Category assignment
5. Cover image
6. Album items manager
7. Display settings
8. Embed options
9. SEO fields

### Album Items Manager

Must support:

- choose from existing media library
- multi-select add
- drag reorder
- remove item
- override caption and alt text
- mark cover image

This should use the existing media picker patterns rather than inventing a second media browser.

### Categories Screen

Simple CRUD list/table:

- name
- slug
- description
- album count
- published state

### Settings Screen

Gallery plugin settings should be minimal in v1:

- gallery enabled
- default layout preset
- default lightbox enabled
- default captions enabled
- max images shown in embeds before pagination/load-more

---

## Editor Integration

### Primary Authoring Path: `albumEmbed` Block

Add a new custom TipTap block extension:

- block name: `albumEmbed`

Block attrs:

- `albumId: string`
- `albumSlug?: string`
- `layout?: string`
- `columns?: number`
- `showTitle?: boolean`
- `showDescription?: boolean`
- `showCaptions?: boolean`
- `limit?: number`

### Slash Command

Add slash command:

- `/album`

This should open an album selector, not require manual ID entry.

### Block UI Requirements

- choose album from published/draft albums accessible to the editor
- preview cover image and item count
- allow optional layout overrides
- copy shortcode from block controls if desired

### Why Block-First Matters

The block path gives:

- structured validation
- better preview
- safer editing
- stronger migration path
- consistent authoring with the existing editor system

Shortcodes alone are too fragile to be the primary authoring model.

---

## Shortcode Compatibility Layer

### Supported Syntax

V1 should support a narrow, intentional syntax only:

- `[album id="..."]`
- `[album slug="summer-trip"]`
- `[album slug="summer-trip" layout="masonry" columns="3"]`
- `[album slug="summer-trip" show_title="true" show_captions="false"]`

### Supported Attributes

- `id`
- `slug`
- `layout`
- `columns`
- `limit`
- `show_title`
- `show_description`
- `show_captions`

### Design Rule

Do **not** build a generic WordPress-style shortcode engine in v1.

Instead:

- parse only known gallery shortcode patterns
- resolve them into the same render pipeline used by the `albumEmbed` block

This keeps the implementation safe and deterministic.

### Resolution Pipeline

1. Content renderer encounters a shortcode token.
2. Token parser validates supported gallery syntax.
3. Resolver queries `gallery.public.getEmbed`.
4. Website renders the same `AlbumEmbed` component used by block rendering.

One renderer. Two authoring inputs.

---

## Website Responsibilities

The website needs more than shortcode parsing. It must provide the public rendering layer.

### Public Routes

Recommended:

- `/gallery`
- `/gallery/$slug`
- `/gallery/category/$slug`

### Public Components

- `AlbumEmbed`
- `AlbumGrid`
- `AlbumMasonry`
- `AlbumCard`
- `AlbumPage`
- `AlbumArchivePage`
- `AlbumLightbox`
- `AlbumCaption`

### Consumer Query Usage

All gallery data used by the website must come from:

- `@convexpress-website/backend/generated/api`

The website must never own gallery schema or Convex functions.

---

## Lightbox / Modal Specification

The lightbox is not optional polish. It is core product behavior.

### Required Behavior

- click thumbnail opens modal
- display large image
- show caption if available
- show current position, e.g. `3 / 12`
- previous/next controls
- close button
- backdrop click closes
- `Esc` closes
- left/right arrows navigate
- focus trap while modal is open
- restore focus to triggering thumbnail on close
- body scroll lock while open
- swipe navigation on touch devices

### Accessibility Requirements

- modal must use proper dialog semantics
- initial focus must be predictable
- controls must have clear labels
- all images must preserve meaningful alt text
- reduced-motion users should not be forced through aggressive transitions

### Performance Requirements

- modal should open from thumbnail to large-size derivative, not always original
- preload previous/next adjacent images
- avoid downloading all large images up front
- use media derivatives from the existing Media System

### Future-Friendly Nice-To-Haves

- zoom
- deep linking to an image index
- fullscreen mode
- slideshow autoplay

These are not required for v1.

---

## Layout and Rendering Modes

V1 should support at least:

- `grid`
- `masonry`

Potential future modes:

- `justified`
- `carousel`

### Responsive Behavior

Albums should define defaults for:

- desktop column count
- tablet column count
- mobile column count

Embeds may override these values per instance, but the base album settings should remain authoritative.

---

## Performance Strategy

This is mandatory for enterprise quality.

### Data Access

- resolve album items in one bounded query path
- avoid N+1 media lookups where possible
- denormalize lightweight fields onto album records when useful
- hard-bound large queries

### Rendering

- lazy-load thumbnails below the fold
- use `srcset`/responsive images where available
- prefer medium/large derivatives for modal display
- paginate or chunk very large albums

### Album Size Policy

Recommended guidance:

- 1-50 images: render directly
- 51-250 images: render with chunking/load-more
- 250+ images: explicit pagination or segmented load

This policy prevents extremely large albums from collapsing page performance.

---

## SEO, Sitemap, and Analytics

### SEO

Standalone public album pages should support:

- title
- meta description
- Open Graph image from cover image
- canonical URL

### Sitemap

Published public albums should be included in the sitemap.

### Analytics

Recommended events:

- album viewed
- lightbox opened
- image advanced
- download clicked

This can be integrated with the existing analytics system later, but the data model should anticipate it.

---

## Failure Modes and Edge Cases

The system must handle these cleanly:

1. album exists but media item has been deleted
2. cover image no longer belongs to album
3. shortcode references missing slug or ID
4. plugin disabled after content already contains embeds
5. private/password album embedded in public page
6. very large album on slow network
7. reorder conflicts from concurrent editing
8. draft album embedded in published page

Recommended fallback behavior:

- public rendering: fail closed
- admin UI: show explicit warning and recovery affordances

---

## Testing Requirements

### Backend Tests

- permissions for all queries/mutations
- plugin-enabled vs plugin-disabled behavior
- public visibility rules
- album item ordering
- category filtering
- shortcode/embed resolver arguments

### Admin UI Tests

- album creation/editing
- media picker add/remove
- drag reorder persistence
- shortcode copy action
- plugin guard behavior

### Website Tests

- embedded album rendering
- shortcode rendering
- standalone album route
- missing album fallback
- disabled plugin fallback

### Accessibility Tests

- lightbox keyboard navigation
- focus trapping
- screen-reader labels
- reduced-motion handling

---

## Implementation Order

### Phase 1 - Foundation

1. plugin registry and settings
2. schema and validators
3. backend CRUD for albums/categories/items
4. admin album/category screens

### Phase 2 - Public Consumption

1. public queries
2. standalone album routes on website
3. album grid rendering
4. plugin-aware public gating

### Phase 3 - Embedding

1. `albumEmbed` editor block
2. block renderer on website
3. shortcode compatibility layer

### Phase 4 - Presentation Hardening

1. lightbox/modal
2. accessibility pass
3. performance tuning for large albums
4. sitemap/SEO/analytics integration

---

## File and Ownership Map

### Admin Backend

Own under:

- `ConvexPress-Admin/packages/backend/convex/gallery/`
- `ConvexPress-Admin/packages/backend/convex/schema/gallery.ts`

Also update:

- plugin settings
- plugin registry
- capability registry
- sitemap integration
- analytics/event integrations as needed

### Admin Frontend

Own under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/gallery/`
- `ConvexPress-Admin/apps/web/src/components/gallery/`
- editor integration files under `components/editor/`

### Website

Own under:

- `ConvexPress-Website/apps/web/src/routes/_marketing/gallery/`
- `ConvexPress-Website/apps/web/src/components/gallery/`
- content rendering integration in website content renderer

---

## Final Recommendation

Build the Gallery System as a **full plugin-backed content subsystem**, not as a shortcode parser with some admin screens attached.

The correct mental model is:

- Media System stores files.
- Gallery System curates and presents those files as albums.
- Content Editor embeds albums as structured content.
- Website renders albums and their lightbox experience.

If implemented this way, the system will be:

- predictable for authors
- maintainable for engineers
- performant on the website
- consistent with the existing ConvexPress owner/consumer architecture
- extensible for future gallery features without redesign

