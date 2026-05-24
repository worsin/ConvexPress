# Gallery System - File-by-File Implementation Checklist

**System:** Gallery System
**Status:** Planned
**Last Authored:** 2026-04-06
**Companion Spec:** `.codex/docs/GALLERY-SYSTEM.md`

---

## Working Rule

This checklist is the execution plan for building the Gallery System in the existing ConvexPress monorepo.

Boundary reminder:

- `ConvexPress-Admin/` owns schema, backend functions, capabilities, settings, and admin UI.
- `ConvexPress-Website/` consumes the admin-owned backend and renders public gallery experiences.
- The website must not define or deploy Convex functions.

---

## Phase 1 - Plugin Foundation

### 1. Plugin Registry and Settings

Update these files:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/settings/validation.ts`

Changes:

- add plugin id `gallery`
- add `galleryEnabled` to plugin settings
- map route prefixes to `/gallery`
- map nav section id to `gallery`
- ensure plugin defaults to enabled

### 2. Plugin Management UI

Review and update:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/plugins.tsx`
- any plugin settings hooks/components used by the plugin screen

Changes:

- show Gallery in installed plugins list
- allow enable/disable
- surface plugin description and route scope

---

## Phase 2 - Backend Schema and Capability Layer

### 3. Schema Files

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/gallery.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`

Define tables:

- `gallery_albums`
- `gallery_albumItems`
- `gallery_categories`
- `gallery_albumCategoryLinks` if many-to-many is used

### 4. Capability Registration

Review likely capability integration points:

- `ConvexPress-Admin/packages/backend/convex/types/capabilities.ts`
- capability integration helpers used by domain systems

Add capabilities:

- `gallery.view`
- `gallery.create`
- `gallery.edit`
- `gallery.editOwn`
- `gallery.delete`
- `gallery.publish`
- `gallery.manageCategories`

### 5. Route / Permission Definitions

Review and update as needed:

- `ConvexPress-Admin/packages/backend/convex/routeDefinitions/`
- `ConvexPress-Admin/packages/backend/convex/capabilities/`
- any admin access metadata sources currently used for menu and permission guards

Goal:

- `/admin/gallery` routes are recognized by permission and nav systems

---

## Phase 3 - Backend Domain Module

Create a new backend domain:

- `ConvexPress-Admin/packages/backend/convex/gallery/`

### 6. Validators

Create:

- `ConvexPress-Admin/packages/backend/convex/gallery/validators.ts`

Include:

- album create/update args
- item add/remove/reorder args
- category CRUD args
- public embed args
- shared enums for layout, visibility, sort mode

### 7. Query Module

Create:

- `ConvexPress-Admin/packages/backend/convex/gallery/queries.ts`

Admin queries:

- `listAlbums`
- `getAlbum`
- `getAlbumEditorState`
- `listCategories`

Public queries:

- `listPublished`
- `getBySlug`
- `getEmbed`
- `listByCategory`

### 8. Mutations Module

Create:

- `ConvexPress-Admin/packages/backend/convex/gallery/mutations.ts`

Include:

- create album
- update album
- publish/unpublish/trash
- add album items
- remove album item
- reorder album items
- create/update/delete category

### 9. Internal Helpers

Create:

- `ConvexPress-Admin/packages/backend/convex/gallery/internals.ts`
- `ConvexPress-Admin/packages/backend/convex/gallery/helpers.ts`

Responsibilities:

- plugin enabled check
- slug generation
- album item resolution
- cover resolution
- count recomputation
- validation of publish readiness

### 10. Domain Integration File

Create:

- `ConvexPress-Admin/packages/backend/convex/gallery/integration.ts`

Use this to:

- register gallery-specific capabilities if the repo uses domain integration files that way
- register gallery event codes if needed later

---

## Phase 4 - Plugin-Aware Public Enforcement

### 11. Public Gating Helper

Ensure every public gallery query checks plugin enablement.

Possible file locations:

- `ConvexPress-Admin/packages/backend/convex/gallery/internals.ts`
- or a shared helper if plugin gating is centralized

Behavior:

- disabled plugin means public gallery queries return empty/null
- disabled plugin means embed resolution fails closed

### 12. Follow the Stronger Pattern

Use Recipes as a reference for backend plugin gating:

- `ConvexPress-Admin/packages/backend/convex/recipes/queries.ts`

But apply it consistently to:

- list queries
- single-item public queries
- embed resolver queries

---

## Phase 5 - Admin UI Routes

Create new admin routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/gallery.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/gallery/index.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/gallery/albums.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/gallery/albums/$albumId.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/gallery/categories.tsx`
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/gallery/settings.tsx`

Notes:

- guard the gallery layout route with `PluginGuard`
- use the same route structure pattern used by KB, Tickets, and Recipes

### 13. Route Tree / Nav Integration

Likely files to touch:

- admin shell/nav config files
- route permission guard integration files

Potential candidates:

- `ConvexPress-Admin/apps/web/src/lib/route-permission-guard.tsx`
- admin nav section definitions wherever sidebar sections are defined

Goal:

- Gallery appears in admin nav
- Gallery disappears when disabled
- Gallery admin routes are blocked when disabled

---

## Phase 6 - Admin Components

Create a dedicated component area:

- `ConvexPress-Admin/apps/web/src/components/gallery/`

Recommended components:

- `GalleryAlbumsTable.tsx`
- `GalleryAlbumEditor.tsx`
- `GalleryAlbumForm.tsx`
- `GalleryAlbumItemsManager.tsx`
- `GalleryAlbumItemCard.tsx`
- `GalleryCategoryManager.tsx`
- `GallerySettingsForm.tsx`
- `GalleryEmbedPanel.tsx`
- `GalleryAlbumPreview.tsx`

### 14. Media Picker Integration

Reuse:

- `ConvexPress-Admin/apps/web/src/components/editor/MediaPicker.tsx`

If needed, create supporting wrappers:

- `ConvexPress-Admin/apps/web/src/components/gallery/GalleryMediaSelector.tsx`

Requirements:

- select many media items
- add to album
- drag reorder
- set cover image
- remove item
- edit per-item caption override

### 15. Shared Types

Create:

- `ConvexPress-Admin/apps/web/src/components/gallery/types.ts`

Use for:

- album editor view models
- category view models
- album item presentation models

---

## Phase 7 - Editor Block Integration

### 16. TipTap Block Extension

Create:

- `ConvexPress-Admin/apps/web/src/components/editor/extensions/album-embed-block.ts`

This block should:

- store `albumId`
- optionally store layout overrides
- render admin-side block preview
- support serialization into post/page content

### 17. Editor Config Registration

Update:

- `ConvexPress-Admin/apps/web/src/components/editor/useEditorConfig.ts`

Changes:

- register the new `albumEmbed` extension

### 18. Slash Command Registration

Update:

- `ConvexPress-Admin/apps/web/src/components/editor/slash-command-items.ts`
- optionally block inserter UI files if needed

Changes:

- add `/album`
- launch album selector flow

### 19. Editor Types

Update or extend:

- `ConvexPress-Admin/apps/web/src/types/editor.ts`

If editor block attrs/types are centralized, add the `albumEmbed` block contract there.

### 20. Block Inserter / Preview UI

Review and update:

- `ConvexPress-Admin/apps/web/src/components/editor/BlockInserter.tsx`
- `ConvexPress-Admin/apps/web/src/components/editor/SlashCommandMenu.tsx`
- `ConvexPress-Admin/apps/web/src/components/editor/editor-styles.css`

Goal:

- album block appears as a first-class insertable block
- block preview is visually distinct and useful

---

## Phase 8 - Website Public Routes and Components

Create a website component area:

- `ConvexPress-Website/apps/web/src/components/gallery/`

Recommended files:

- `AlbumEmbed.tsx`
- `AlbumGrid.tsx`
- `AlbumMasonry.tsx`
- `AlbumCard.tsx`
- `AlbumPage.tsx`
- `AlbumArchivePage.tsx`
- `AlbumLightbox.tsx`
- `AlbumLightboxImage.tsx`
- `AlbumCaption.tsx`
- `types.ts`

### 21. Public Marketing Routes

Create:

- `ConvexPress-Website/apps/web/src/routes/_marketing/gallery.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/gallery/index.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/gallery/$slug.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/gallery/category/$slug.tsx`

Follow the same pattern used by:

- help center routes
- recipes routes
- blog routes

### 22. Public Data Access

Use consumer-only API imports:

- `@convexpress-website/backend/generated/api`

Do not add Convex functions to the website package.

---

## Phase 9 - Website Content Rendering Integration

### 23. Render Pipeline Extension

Review and update:

- `ConvexPress-Website/apps/web/src/lib/blog/renderContent.ts`
- `ConvexPress-Website/apps/web/src/lib/blog/types.ts`

Changes:

- add support for `albumEmbed` rendering
- keep render path consistent with other custom blocks

### 24. Shortcode Parsing Layer

Create:

- `ConvexPress-Website/apps/web/src/lib/gallery/shortcodes.ts`
- `ConvexPress-Website/apps/web/src/lib/gallery/resolve-shortcode.ts`

Or equivalent structure under `src/lib/gallery/`.

Responsibilities:

- parse `[album ...]`
- validate supported attributes
- normalize input into the same props contract used by `AlbumEmbed`

### 25. One Renderer, Two Inputs

Both of these must end at the same rendering target:

- TipTap `albumEmbed` block
- `[album ...]` shortcode

That renderer should be:

- `AlbumEmbed`

This avoids block/shortcode drift.

---

## Phase 10 - Lightbox / Modal Layer

### 26. Lightbox Components

Create:

- `ConvexPress-Website/apps/web/src/components/gallery/AlbumLightbox.tsx`
- `ConvexPress-Website/apps/web/src/components/gallery/AlbumLightboxImage.tsx`

Potential supporting hooks:

- `ConvexPress-Website/apps/web/src/components/gallery/useAlbumLightbox.ts`

Requirements:

- dialog semantics
- focus trap
- escape to close
- arrow key nav
- swipe support
- scroll lock
- restore focus on close
- caption display
- adjacent image preload

### 27. Reuse Existing UI Patterns

Review existing website UI primitives before creating new ones:

- dialog primitives in `apps/web/src/components/ui/`

Prefer existing design primitives unless the lightbox needs a dedicated composition.

---

## Phase 11 - SEO, Sitemap, Search, Analytics

### 28. SEO Integration

Review and update as needed:

- `ConvexPress-Admin/packages/backend/convex/seo/`
- website route `head()` metadata for gallery routes

Goal:

- album pages can emit proper title/description/Open Graph metadata

### 29. Sitemap Integration

Review and update:

- `ConvexPress-Admin/packages/backend/convex/sitemaps/`
- sitemap source aggregation files

Goal:

- published public albums are included in sitemap generation

### 30. Search Integration

Optional for v1 but recommended shortly after:

- add gallery album records to unified search if gallery pages should be searchable

Review:

- `ConvexPress-Admin/packages/backend/convex/search/`
- search schema integration files

### 31. Analytics Integration

Optional for initial ship, but the event surface should be defined early:

- album page view
- lightbox open
- next/previous image navigation

Potential integration points:

- `ConvexPress-Admin/packages/backend/convex/analytics/`
- `ConvexPress-Website/apps/web/src/lib/analytics/`

---

## Phase 12 - Testing and Hardening

### 32. Backend Tests

Add tests near the backend gallery module if repo conventions support it.

Test:

- permissions
- plugin disabled behavior
- public/private/password rules
- album item ordering
- category filtering
- embed resolver correctness

### 33. Frontend Tests

If route/component testing exists, cover:

- album routes
- embed rendering
- shortcode rendering
- disabled-plugin fallback
- missing album fallback
- modal keyboard support

### 34. Manual Verification Checklist

Verify:

- plugin appears in admin plugins screen
- gallery nav hides when disabled
- gallery admin routes block when disabled
- public `/gallery` routes fail closed when disabled
- album block inserts and saves correctly
- shortcode resolves correctly
- lightbox works with mouse, keyboard, and touch
- large albums do not tank performance

---

## Suggested Implementation Order

Use this exact order to reduce churn:

1. plugin registry and settings
2. schema + validators + capability registration
3. backend CRUD + public queries
4. admin routes + album/category management UI
5. website standalone album pages
6. editor `albumEmbed` block
7. website block render integration
8. shortcode compatibility layer
9. lightbox/modal
10. sitemap/SEO/analytics hardening

---

## Minimal V1 Deliverable

If implementation needs a strict first shipping slice, it should include:

- plugin registration
- album/category schema
- admin album CRUD
- add/reorder/remove images via media picker
- public album route
- `albumEmbed` block
- shortcode compatibility for `[album id="..."]` and `[album slug="..."]`
- accessible lightbox

Everything else is secondary.

---

## Anti-Patterns To Avoid

Do not do these:

- do not create a second media storage system
- do not store album image arrays directly on the album doc if ordering/metadata is needed
- do not make shortcode parsing the primary authoring flow
- do not let public gallery rendering ignore plugin disablement
- do not duplicate render logic for block embeds and shortcode embeds
- do not add Convex functions to `ConvexPress-Website/`

---

## Final Build Principle

The Gallery System should be implemented as:

- **backend-owned**
- **plugin-aware**
- **block-first**
- **shortcode-compatible**
- **media-reusing**
- **website-consumed**

If any design choice conflicts with those principles, prefer the option that preserves them.

