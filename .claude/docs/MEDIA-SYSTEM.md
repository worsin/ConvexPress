# Media System - Expert Knowledge Document

**System:** Media System
**Status:** Complete (100%)
**Priority:** P1 - High
**Complexity:** Complex
**Layer:** Full Stack
**WordPress Equivalent:** Media Library (wp_posts attachment post type, wp_postmeta attachment metadata, Media Library screens, image editor, file upload handler)
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Media System is the file management engine of ConvexPress. It handles the complete media lifecycle: uploading, storing, organizing, editing metadata, processing images (cropping, resizing, generating thumbnails), serving files to the website, and deleting media. It is the WordPress equivalent of the Media Library infrastructure -- covering `wp_posts` (attachment post type), `wp_postmeta` (attachment metadata), the Media Library admin screen, the Add New Media upload screen, the Edit Media screen, and all core media functions like `wp_handle_upload()`, `wp_insert_attachment()`, `wp_generate_attachment_metadata()`, `wp_get_attachment_url()`, `wp_delete_attachment()`, and `wp_get_image_editor()`.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Media Types** | `image`, `video`, `audio`, `document`, `archive`, `other` |
| **Media Statuses** | `processing` (thumbnails being generated), `active` (ready), `failed` (processing error) |
| **Image Sizes** | `thumbnail` (150x150 crop), `medium` (300px max), `medium_large` (768px max), `large` (1024px max), `full` (original) |
| **Capabilities** | `upload_files` (Author+), `edit_others_media` (Editor+), `delete_others_media` (Editor+) |
| **Storage** | Convex file storage (managed cloud, CDN-backed URLs) |
| **Processing** | Image sizes generated asynchronously via scheduled Convex actions using Sharp |
| **Media Picker** | Inline panel/sheet component (NOT a modal) for selecting media within editors |
| **No Trash** | Media deletion is permanent (matches WordPress behavior) |
| **No Attachment Pages** | No dedicated permalink pages for media items (SEO-negative, rarely used) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Storage** | Local filesystem (`wp-content/uploads/YYYY/MM/`) | Convex file storage (managed cloud, CDN-backed) |
| **Database** | MySQL `wp_posts` + `wp_postmeta` | Convex `media` + `mediaSizes` + `mediaMeta` tables |
| **Upload Handler** | PHP `wp_handle_upload()` via `admin-ajax.php` | Convex action with file storage API |
| **Image Processing** | GD/Imagick on server | Sharp via Convex action |
| **Thumbnails** | Generated on upload, stored as files | Generated on upload via scheduled action, stored as separate Convex storage entries |
| **URLs** | `wp-content/uploads/2025/01/image.jpg` | Convex storage URL (CDN-backed) |
| **Auth** | Cookie-based, `current_user_can('upload_files')` | Convex Auth JWT + capability check in Convex mutation |
| **Reactivity** | Page refresh / AJAX poll | Real-time Convex subscriptions (library updates live) |
| **Media Picker** | Modal overlay (`wp.media` frame) | Inline panel or sheet component |
| **Crop Tool** | Server-side via GD/Imagick, inline editor | Client-side preview + server-side execution via Convex action |
| **EXIF Data** | Extracted via PHP `exif_read_data()` | Extracted via npm `exif-parser` in Convex action |
| **File Organization** | Year/month folder structure | Flat storage with metadata-based filtering |
| **Attachment Page** | Dedicated permalink per media item | Not implemented |

---

## Architecture Overview

### Data Flow

1. **Upload:** User drops files in drop zone or selects via file picker.
2. **Client Validation:** File type and size validated client-side before upload.
3. **Convex Action:** `media.upload` action stores file to Convex file storage, creates media record with `status: "processing"`, extracts EXIF from images.
4. **Async Processing:** For images, a scheduled action (`internal.media.processImage`) generates thumbnail, medium, medium_large, and large sizes using Sharp. Each size is stored as a separate Convex storage entry with a `mediaSizes` record.
5. **Status Update:** Media record transitions from `"processing"` to `"active"` (or `"failed"` on error).
6. **Event Emission:** `media.uploaded` event emitted, consumed by notification and audit systems.
7. **Real-Time Updates:** All connected clients see the new media item appear in the library via Convex subscriptions.
8. **Serving:** Website components use `MediaImage` component that renders `<img>` with `srcset` from all available sizes.

### Real-Time Behavior

- **Media Library:** Uses `useQuery(api.media.list, filters)` subscription. When any user uploads, edits, or deletes media, all connected admin clients see updates live.
- **Type Count Tabs:** Separate `useQuery(api.media.counts)` subscription to avoid recalculating counts on every list update.
- **Upload Page:** "Recently Uploaded" section is a reactive query filtered to the current session's uploads.
- **Processing Status:** Media items in `"processing"` state show spinner overlay. When processing completes, the overlay disappears reactively.
- **Edit Media Page:** `useQuery(api.media.get, { mediaId })` keeps the edit form in sync if another user modifies the same item.

### Authentication & Authorization

- **Auth Provider:** Convex Auth (AuthKit pattern). User identity extracted from the auth system JWT in every Convex function.
- **Capability Checks:**
  - `upload_files` -- Required to upload, edit own media, delete own media (Author+ roles).
  - `edit_others_media` -- Required to edit metadata/images of other users' uploads (Editor+ roles).
  - `delete_others_media` -- Required to delete other users' uploads (Editor+ roles).
  - Read access -- All authenticated users can view the media library.
- **Ownership Model:** Each media item has an `uploadedBy` field (user identifier). Authors can only modify their own uploads. Editors and Administrators can modify all uploads.

---

## Database Schema

### `media` Table

The primary table storing all uploaded media items (images, videos, audio, documents, archives).

```typescript
// convex/schema.ts

const mediaStatus = v.union(
  v.literal("processing"),    // Upload complete, image sizes being generated
  v.literal("active"),        // Fully processed and available
  v.literal("failed"),        // Processing failed (bad file, corrupt image)
);

const mediaType = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("document"),
  v.literal("archive"),
  v.literal("other"),
);

media: defineTable({
  // --- Core Fields ---
  title: v.string(),                            // Display title (default: filename without extension)
  fileName: v.string(),                         // Original uploaded filename (e.g., "photo.jpg")
  slug: v.string(),                             // URL-safe identifier (auto-generated from title)
  description: v.optional(v.string()),          // Long description (post_content equivalent)
  caption: v.optional(v.string()),              // Short caption (post_excerpt equivalent)
  altText: v.optional(v.string()),              // Alt text for accessibility (images only)

  // --- File Storage ---
  storageId: v.string(),                        // Convex storage ID for the original file
  url: v.string(),                              // Resolved Convex storage URL for the original file
  mimeType: v.string(),                         // MIME type (e.g., "image/jpeg", "application/pdf")
  fileSize: v.number(),                         // File size in bytes
  mediaType: mediaType,                         // Categorized type for filtering

  // --- Image-Specific Fields ---
  width: v.optional(v.number()),                // Original image width in pixels
  height: v.optional(v.number()),               // Original image height in pixels

  // --- Processing ---
  status: mediaStatus,                          // Processing state
  processingError: v.optional(v.string()),      // Error message if processing failed

  // --- Ownership ---
  uploadedBy: v.string(),                       // user identifier of the uploader
  attachedTo: v.optional(v.id("posts")),        // Parent post ID (if attached as featured image, etc.)

  // --- Timestamps ---
  createdAt: v.number(),                        // Upload timestamp (ms)
  updatedAt: v.number(),                        // Last modification timestamp (ms)
})
  // --- Indexes ---
  .index("by_status", ["status"])
  .index("by_type", ["mediaType"])
  .index("by_uploader", ["uploadedBy"])
  .index("by_uploader_type", ["uploadedBy", "mediaType"])
  .index("by_slug", ["slug"])
  .index("by_mime", ["mimeType"])
  .index("by_attached", ["attachedTo"])
  .index("by_created", ["createdAt"])
  .index("by_type_created", ["mediaType", "createdAt"])
  // --- Search Index ---
  .searchIndex("search_media", {
    searchField: "title",
    filterFields: ["mediaType", "status", "uploadedBy"],
  })
```

#### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `title` | `string` | Yes | Filename without extension | Max 500 chars. Trimmed whitespace. |
| `fileName` | `string` | Yes | Original filename | Preserved exactly as uploaded. Max 255 chars. |
| `slug` | `string` | Yes | Auto-generated from title | Lowercase, alphanumeric + hyphens. Unique. Max 200 chars. |
| `description` | `string` | No | `undefined` | Max 5000 chars. |
| `caption` | `string` | No | `undefined` | Max 1000 chars. |
| `altText` | `string` | No | `undefined` | Max 500 chars. Recommended for images. |
| `storageId` | `string` | Yes | Set on upload | Valid Convex storage ID. |
| `url` | `string` | Yes | Resolved from storageId | Valid URL. Updated if storage URL changes. |
| `mimeType` | `string` | Yes | Detected on upload | Valid MIME type from allowed list. |
| `fileSize` | `number` | Yes | Detected on upload | Positive integer (bytes). Max configurable (default 50MB). |
| `mediaType` | `enum` | Yes | Derived from mimeType | One of: image, video, audio, document, archive, other. |
| `width` | `number` | No | Extracted from image | Positive integer. Only for images/video. |
| `height` | `number` | No | Extracted from image | Positive integer. Only for images/video. |
| `status` | `enum` | Yes | `"processing"` | One of: processing, active, failed. |
| `processingError` | `string` | No | `undefined` | Set when status is "failed". |
| `uploadedBy` | `string` | Yes | Current user Convex Auth ID | Valid user identifier. |
| `attachedTo` | `Id<"posts">` | No | `undefined` | Valid post ID if attached. |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable after creation. |
| `updatedAt` | `number` | Yes | `Date.now()` | Updated on every mutation. |

### `mediaSizes` Table

Generated image variants (thumbnail, medium, medium_large, large) for each image media item.

```typescript
mediaSizes: defineTable({
  mediaId: v.id("media"),                       // Parent media item
  sizeName: v.string(),                         // Size name: "thumbnail", "medium", "medium_large", "large"
  storageId: v.string(),                        // Convex storage ID for this size
  url: v.string(),                              // Resolved URL for this size
  width: v.number(),                            // Actual width after resize
  height: v.number(),                           // Actual height after resize
  fileSize: v.number(),                         // File size in bytes for this variant
  mimeType: v.string(),                         // MIME type (may differ if converted, e.g., webp)
  crop: v.boolean(),                            // Whether this was a hard crop
})
  .index("by_media", ["mediaId"])
  .index("by_media_size", ["mediaId", "sizeName"])
```

#### Field Specifications

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `mediaId` | `Id<"media">` | Yes | Must reference existing media item. |
| `sizeName` | `string` | Yes | One of: "thumbnail", "medium", "medium_large", "large". |
| `storageId` | `string` | Yes | Valid Convex storage ID. |
| `url` | `string` | Yes | Resolved from storageId. |
| `width` | `number` | Yes | Actual pixel width. |
| `height` | `number` | Yes | Actual pixel height. |
| `fileSize` | `number` | Yes | Size in bytes. |
| `mimeType` | `string` | Yes | Same as parent or converted format. |
| `crop` | `boolean` | Yes | True if hard-cropped (thumbnail), false if proportional. |

### `mediaMeta` Table

Extensible key-value metadata store for media items (EXIF data, crop data, edit history).

```typescript
mediaMeta: defineTable({
  mediaId: v.id("media"),                       // Foreign key to media table
  key: v.string(),                              // Meta key
  value: v.string(),                            // Meta value (JSON-encoded for complex values)
})
  .index("by_media", ["mediaId"])
  .index("by_media_key", ["mediaId", "key"])
  .index("by_key", ["key"])
```

#### Known Meta Keys

| Meta Key | Used By | Value Type | Description |
|----------|---------|------------|-------------|
| `_exif_camera` | Media System | `string` | Camera make + model |
| `_exif_aperture` | Media System | `string` | f-stop value |
| `_exif_focal_length` | Media System | `string` | Focal length in mm |
| `_exif_iso` | Media System | `string` | ISO speed |
| `_exif_shutter_speed` | Media System | `string` | Shutter speed |
| `_exif_date_taken` | Media System | `string` | Original capture timestamp |
| `_exif_orientation` | Media System | `string` | EXIF orientation value (1-8) |
| `_exif_copyright` | Media System | `string` | Copyright notice |
| `_exif_credit` | Media System | `string` | Photographer credit |
| `_exif_keywords` | Media System | `string` (JSON array) | IPTC keywords |
| `_exif_gps_lat` | Media System | `string` | GPS latitude |
| `_exif_gps_lng` | Media System | `string` | GPS longitude |
| `_crop_data` | Media System | `string` (JSON) | Last crop coordinates `{ x, y, width, height }` |
| `_original_storage_id` | Media System | `string` | Original file before any edits (for revert) |
| `_edit_history` | Media System | `string` (JSON array) | History of edits applied (crop, rotate, flip) |

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `media` | `by_status` | `["status"]` | Filter by processing status |
| `media` | `by_type` | `["mediaType"]` | Filter by media type (images, video, etc.) |
| `media` | `by_uploader` | `["uploadedBy"]` | My uploads filter |
| `media` | `by_uploader_type` | `["uploadedBy", "mediaType"]` | My uploads filtered by type |
| `media` | `by_slug` | `["slug"]` | O(1) slug lookup |
| `media` | `by_mime` | `["mimeType"]` | Filter by specific MIME type |
| `media` | `by_attached` | `["attachedTo"]` | Find media attached to a specific post |
| `media` | `by_created` | `["createdAt"]` | Sort by upload date |
| `media` | `by_type_created` | `["mediaType", "createdAt"]` | Type + date combined filtering |
| `media` | `search_media` | search: `title`, filter: `mediaType, status, uploadedBy` | Full-text search |
| `mediaSizes` | `by_media` | `["mediaId"]` | All sizes for a media item |
| `mediaSizes` | `by_media_size` | `["mediaId", "sizeName"]` | Specific size lookup |
| `mediaMeta` | `by_media` | `["mediaId"]` | All meta for a media item |
| `mediaMeta` | `by_media_key` | `["mediaId", "key"]` | Specific meta value lookup |
| `mediaMeta` | `by_key` | `["key"]` | All media with a given meta key |

### Relationships

| This Table | Field | References | Relationship |
|-----------|-------|------------|-------------|
| `media.uploadedBy` | `string` | user identifier | Many-to-one (many media per user) |
| `media.attachedTo` | `Id<"posts">` | `posts` table | Many-to-one (many media per post, optional) |
| `mediaSizes.mediaId` | `Id<"media">` | `media` table | Many-to-one (many sizes per media) |
| `mediaMeta.mediaId` | `Id<"media">` | `media` table | Many-to-one (many meta per media) |
| `posts.featuredImageId` | `Id<"media">` | `media` table | One-to-one (one featured image per post) |

### Image Size Configuration (via Settings System)

| Setting Key | Default Value | Description |
|-------------|---------------|-------------|
| `media_thumbnail_width` | `150` | Thumbnail max width |
| `media_thumbnail_height` | `150` | Thumbnail max height |
| `media_thumbnail_crop` | `true` | Hard crop thumbnail |
| `media_medium_width` | `300` | Medium max width |
| `media_medium_height` | `300` | Medium max height |
| `media_large_width` | `1024` | Large max width |
| `media_large_height` | `1024` | Large max height |
| `media_max_upload_size` | `52428800` (50MB) | Max file size in bytes |
| `media_allowed_types` | `["image/*","video/*","audio/*","application/pdf",...]` | Allowed MIME type patterns |

---

## Actions & Functions

### Actions (Convex Actions -- require file I/O)

#### `media.upload` - Upload Media

- **Airtable Record:** `recavdvfsH3hM3swU`
- **Convex Function:** `actions/media.upload`
- **Type:** Action (uses Convex file storage API)
- **Auth:** Required
- **Capabilities:** `upload_files` (Administrator, Editor, Author)
- **Args:**
  ```typescript
  {
    file: v.bytes(),                              // File binary data
    fileName: v.string(),                         // Original filename
    mimeType: v.string(),                         // MIME type
    fileSize: v.number(),                         // Size in bytes
    title: v.optional(v.string()),                // Custom title (default: filename without extension)
    altText: v.optional(v.string()),              // Alt text (images)
    caption: v.optional(v.string()),              // Caption
    description: v.optional(v.string()),          // Description
    attachedTo: v.optional(v.id("posts")),        // Parent post to attach to
  }
  ```
- **Returns:** `{ mediaId: Id<"media">, url: string, status: MediaStatus }`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `upload_files`.
  3. Pre-upload validation: validate MIME type against allowed types list from Settings, validate file size against `media_max_upload_size` setting, validate filename is not empty and has no path traversal characters, sanitize filename (remove special chars, replace spaces with hyphens).
  4. Store file to Convex file storage: `ctx.storage.store(file)`. Get `storageId`.
  5. Resolve public URL: `ctx.storage.getUrl(storageId)`.
  6. Determine `mediaType` from `mimeType` using `categorizeMediaType()` helper.
  7. Generate title from filename if not provided (strip extension, replace hyphens/underscores with spaces, title case).
  8. Generate unique slug from title using `generateUniqueSlug()`.
  9. Insert media record with `status: "processing"`.
  10. If image: extract dimensions (width, height) from binary data, extract EXIF metadata (JPEG/TIFF) and store in `mediaMeta`, schedule `ctx.scheduler.runAfter(0, internal.media.processImage, { mediaId })`.
  11. If not image: set `status` to `"active"` immediately.
  12. Emit event: `media.uploaded`.
  13. Return `{ mediaId, url, status }`.
- **Events:** `media.uploaded`
- **Errors:**
  - `UNAUTHORIZED` -- User not authenticated.
  - `FORBIDDEN` -- User lacks `upload_files` capability.
  - `VALIDATION_ERROR` -- File type not allowed, file exceeds max upload size, empty filename.
  - `STORAGE_ERROR` -- Convex file storage write failure.

#### `internal.media.processImage` - Process Image Sizes (Internal)

- **Type:** Internal Action (not externally callable)
- **Args:** `{ mediaId: v.id("media") }`
- **Behavior:**
  1. Fetch the media item. Verify it is an image.
  2. Fetch the original file from storage.
  3. Read image size settings from Settings System.
  4. For each configured size (thumbnail, medium, medium_large, large): resize/crop image using Sharp, store resized image to Convex storage, insert `mediaSizes` record.
  5. Mark media as `status: "active"`.
  6. On error: mark media as `status: "failed"` with error message.

#### `media.crop` - Crop Image

- **Airtable Record:** `recn9ZBSIEa5Pxa98`
- **Convex Function:** `actions/media.crop`
- **Type:** Action
- **Auth:** Required
- **Capabilities:** Own media: `upload_files`; others' media: `edit_others_media`
- **Args:**
  ```typescript
  {
    mediaId: v.id("media"),
    cropData: v.object({
      x: v.number(),       // Crop X offset (pixels from left)
      y: v.number(),       // Crop Y offset (pixels from top)
      width: v.number(),   // Crop width (pixels)
      height: v.number(),  // Crop height (pixels)
    }),
    applyToSizes: v.optional(v.union(
      v.literal("all"),              // Regenerate all sizes from cropped original
      v.literal("thumbnail_only"),   // Only update thumbnail
    )),
  }
  ```
- **Returns:** Updated media item with new sizes.
- **Behavior:**
  1. Auth + capability check.
  2. Validate media is an image. Validate crop coordinates (non-negative, within bounds, at least 1px).
  3. Save original `storageId` in `mediaMeta` as `_original_storage_id` (if not already saved).
  4. Fetch original image, apply crop via Sharp.
  5. Store cropped image, update media record (new storageId, url, width, height, fileSize).
  6. Store `_crop_data` and append to `_edit_history` in `mediaMeta`.
  7. If `applyToSizes` is `"all"` (default): delete all existing `mediaSizes` + storage, regenerate all sizes.
  8. If `applyToSizes` is `"thumbnail_only"`: delete/regenerate only thumbnail.
  9. Update `updatedAt`. Emit `media.updated`.
- **Events:** `media.updated`
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR` (not an image, coordinates out of bounds), `PROCESSING_ERROR`.

#### `media.rotate` - Rotate Image

- **Convex Function:** `actions/media.rotate`
- **Type:** Action
- **Auth:** Required
- **Capabilities:** Own: `upload_files`; others': `edit_others_media`
- **Args:**
  ```typescript
  {
    mediaId: v.id("media"),
    degrees: v.union(v.literal(90), v.literal(180), v.literal(270)),
  }
  ```
- **Behavior:** Same auth/save-original pattern as crop. Apply rotation via Sharp. Swap width/height for 90/270 rotations. Regenerate all image sizes. Append to `_edit_history`. Emit `media.updated`.
- **Events:** `media.updated`

#### `media.flip` - Flip Image

- **Convex Function:** `actions/media.flip`
- **Type:** Action
- **Auth:** Required
- **Capabilities:** Own: `upload_files`; others': `edit_others_media`
- **Args:**
  ```typescript
  {
    mediaId: v.id("media"),
    direction: v.union(v.literal("horizontal"), v.literal("vertical")),
  }
  ```
- **Behavior:** Same pattern as rotate. Flip does not change dimensions. Regenerate all sizes. Emit `media.updated`.
- **Events:** `media.updated`

#### `media.scale` - Scale/Resize Image

- **Convex Function:** `actions/media.scale`
- **Type:** Action
- **Auth:** Required
- **Capabilities:** Own: `upload_files`; others': `edit_others_media`
- **Args:**
  ```typescript
  {
    mediaId: v.id("media"),
    width: v.number(),                           // Target width
    height: v.optional(v.number()),              // Auto-calculated if omitted
  }
  ```
- **Behavior:** Auth + capability check. Validate new dimensions are smaller than or equal to original (cannot upscale). If only width provided, calculate height maintaining aspect ratio. Save original, resize, store, update record, regenerate sizes. Emit `media.updated`.
- **Events:** `media.updated`

#### `media.revert` - Revert to Original

- **Convex Function:** `actions/media.revert`
- **Type:** Action
- **Auth:** Required
- **Capabilities:** Own: `upload_files`; others': `edit_others_media`
- **Args:**
  ```typescript
  {
    mediaId: v.id("media"),
  }
  ```
- **Behavior:** Auth + capability check. Check `_original_storage_id` exists (error if no edits to revert). Restore original storageId, delete edited version. Recalculate dimensions. Regenerate all image sizes. Clear `_crop_data`, `_edit_history`, `_original_storage_id` from mediaMeta. Emit `media.updated`.
- **Events:** `media.updated`

### Mutations

#### `media.update` - Update Media Metadata

- **Airtable Record:** `recUghMLHvRszJU0U`
- **Convex Function:** `mutations/media.update`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Own: `upload_files`; others': `edit_others_media` (Administrator, Editor, Author)
- **Args:**
  ```typescript
  {
    mediaId: v.id("media"),
    title: v.optional(v.string()),
    altText: v.optional(v.string()),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),
    attachedTo: v.optional(v.id("posts")),
  }
  ```
- **Returns:** Updated media item.
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch existing media item.
  3. Capability check: own media needs `upload_files`, others' needs `edit_others_media`.
  4. If `slug` changing, validate uniqueness via `generateUniqueSlug()`.
  5. If `title` changed and slug was auto-generated, regenerate slug.
  6. Track changed fields for event payload.
  7. Update `updatedAt` to `Date.now()`.
  8. Update media record.
  9. Emit `media.updated` with changed fields.
  10. Return updated media item.
- **Events:** `media.updated`
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT` (slug taken), `VALIDATION_ERROR` (title exceeds 500 chars).

#### `media.delete` - Delete Media

- **Airtable Record:** `recwq5RrbLEXS3wyZ`
- **Convex Function:** `mutations/media.delete`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Own: `upload_files`; others': `delete_others_media` (Administrator, Editor)
- **Args:**
  ```typescript
  {
    mediaId: v.id("media"),
  }
  ```
- **Returns:** Success.
- **Behavior:**
  1. Authenticate user via Convex Auth.
  2. Fetch existing media item.
  3. Capability check: own needs `upload_files`, others' needs `delete_others_media`.
  4. Delete original file from Convex storage.
  5. Delete all `mediaSizes` records and their storage files.
  6. Delete all `mediaMeta` records.
  7. Clear references: find posts with `featuredImageId` referencing this media and set to `undefined`. Note: inline content references (Content Editor blocks) are NOT automatically cleaned -- they show as broken images (matches WordPress behavior).
  8. Delete media record.
  9. Emit `media.deleted`.
- **Events:** `media.deleted`
- **Errors:** `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`, `STORAGE_ERROR` (orphaned file acceptable).

**IMPORTANT:** Media deletion is permanent. No trash. Matches WordPress behavior. Confirmation dialog in UI is critical.

#### `media.bulkDelete` - Bulk Delete Media

- **Airtable Record:** `recKiCPw8qmU3zstf`
- **Convex Function:** `mutations/media.bulkDelete`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `delete_others_media` (Administrator, Editor)
- **Args:**
  ```typescript
  {
    mediaIds: v.array(v.id("media")),
  }
  ```
- **Returns:** `{ deleted: number, errors: Array<{ mediaId, error }> }`
- **Behavior:**
  1. Auth + `delete_others_media` capability check.
  2. Validate array not empty, max 100 items.
  3. For each item, execute `media.delete` logic.
  4. Emit `media.deleted` per item.
  5. Return success/error counts.
- **Events:** `media.deleted` (one per item)
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` (empty or exceeds 100), `PARTIAL_FAILURE`.

#### `internal.media.setStatus` - Set Media Status (Internal)

- **Type:** Internal Mutation
- **Args:** `{ mediaId: v.id("media"), status: mediaStatus, error?: v.optional(v.string()) }`
- **Behavior:** Updates the `status` and optionally `processingError` fields on a media record. Called by the `processImage` internal action.

### Queries

#### `media.get` - Get Single Media Item

- **Airtable Record:** `recN3lSrSnrBpXVty`
- **Convex Function:** `queries/media.get`
- **Type:** Query
- **Auth:** Required (all authenticated roles)
- **Args:**
  ```typescript
  {
    mediaId: v.optional(v.id("media")),
    slug: v.optional(v.string()),
  }
  ```
- **Returns:** Complete media item with sizes, meta, and uploader info (or `null`).
- **Behavior:**
  1. Look up by `mediaId` or `slug` (using `by_slug` index).
  2. Join all `mediaSizes` via `by_media` index.
  3. Join all `mediaMeta` via `by_media` index.
  4. Include uploader info (name, avatar from the auth system).
  5. Return complete media item.

#### `media.list` - List Media Items

- **Convex Function:** `queries/media.list`
- **Type:** Query
- **Auth:** Optional (public for website rendering; required for admin context)
- **Args:**
  ```typescript
  {
    mediaType: v.optional(mediaType),
    uploadedBy: v.optional(v.string()),
    attachedTo: v.optional(v.id("posts")),
    unattached: v.optional(v.boolean()),
    status: v.optional(mediaStatus),
    search: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    orderBy: v.optional(v.union(
      v.literal("createdAt"),
      v.literal("title"),
      v.literal("fileSize"),
    )),
    orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  }
  ```
- **Returns:** `{ media: Media[], total: number, page: number, perPage: number, totalPages: number }`
- **Behavior:** Apply all filters, sort, paginate. Default sort: `createdAt` descending. Default perPage: 40 (grid) / 20 (list).
- **Pagination:** Cursor-based via `.paginate({ numItems: perPage, cursor })`.
- **Filters:** Type, uploader, attached status, date range, MIME type, search.

#### `media.counts` - Type Count Tabs

- **Convex Function:** `queries/media.counts`
- **Type:** Query
- **Auth:** Required
- **Returns:**
  ```typescript
  {
    all: number,
    images: number,
    video: number,
    audio: number,
    documents: number,
    unattached: number,
    mine: number,
  }
  ```

#### `media.getSrcSet` - Build srcset String

- **Convex Function:** `queries/media.getSrcSet`
- **Type:** Query
- **Auth:** Public (used by website for rendering images)
- **Args:** `{ mediaId: v.id("media") }`
- **Returns:** `string` (srcset attribute value)

### Helper Functions

#### `validateFileType(mimeType, fileName, allowedTypes)`

Validates MIME type against allowed patterns and checks extension matches MIME type (prevents mismatch attacks).

```typescript
// convex/helpers/media.ts
export function validateFileType(
  mimeType: string,
  fileName: string,
  allowedTypes: string[],
): { valid: boolean; error?: string }
```

#### `categorizeMediaType(mimeType)`

Converts MIME type to a `MediaType` category.

```typescript
// convex/helpers/media.ts
export function categorizeMediaType(mimeType: string): MediaType
// image/* -> "image", video/* -> "video", audio/* -> "audio"
// application/pdf, application/msword, etc. -> "document"
// application/zip, application/gzip, etc. -> "archive"
// everything else -> "other"
```

#### `getMediaUrl(ctx, mediaId, size?)`

Gets the URL for a media item, optionally at a specific size.

```typescript
// convex/helpers/media.ts
export async function getMediaUrl(
  ctx: QueryCtx,
  mediaId: Id<"media">,
  size?: string,
): Promise<string | null>
```

#### `getMediaSrc(ctx, mediaId, size?)`

Gets URL + dimensions for a media item at a specific size.

```typescript
// convex/helpers/media.ts
export async function getMediaSrc(
  ctx: QueryCtx,
  mediaId: Id<"media">,
  size?: string,
): Promise<{ url: string; width: number; height: number } | null>
```

#### `buildSrcSet(ctx, mediaId)`

Builds a complete srcset string from all available sizes.

```typescript
// convex/helpers/media.ts
export async function buildSrcSet(
  ctx: QueryCtx,
  mediaId: Id<"media">,
): Promise<string>
```

#### `checkMediaCapability(ctx, userId, media, action)`

Checks media-specific capabilities based on ownership and action type.

```typescript
// convex/helpers/mediaAuth.ts
export async function checkMediaCapability(
  ctx: MutationCtx,
  userId: string,
  media: Doc<"media">,
  action: "upload" | "edit" | "delete" | "read",
): Promise<void>
```

#### `emitMediaEvent(ctx, code, payload)`

Emits a media event via the Event Dispatcher System.

```typescript
// convex/helpers/events.ts
export async function emitMediaEvent(
  ctx: MutationCtx,
  code: string,
  payload: Record<string, any>,
): Promise<void>
```

---

## Events

### `media.uploaded`

- **Airtable Record:** `recv3b6q1GBBia14C`
- **Event Code:** `media.uploaded`
- **Type:** Media
- **Triggered By:** `media.upload` action
- **Payload:**
  ```typescript
  {
    mediaId: Id<"media">,
    fileName: string,
    mimeType: string,
    size: number,                 // File size in bytes
    uploadedBy: string,           // user identifier
    mediaType: MediaType,         // "image" | "video" | "audio" | "document" | "archive" | "other"
  }
  ```
- **Subscribers:**
  - Site Notification: Success toast to uploader ("{count} file(s) uploaded successfully")
  - Audit Log: Records upload in activity log
  - Dashboard: Updates media counts
  - Email: Storage warning if approaching limit (Admin only, batched)

### `media.updated`

- **Airtable Record:** `recJKDatMSCkVFGid`
- **Event Code:** `media.updated`
- **Type:** Media
- **Triggered By:** `media.update`, `media.crop`, `media.rotate`, `media.flip`, `media.scale`, `media.revert`
- **Payload:**
  ```typescript
  {
    mediaId: Id<"media">,
    changes: Array<{
      field: string,              // Field name that changed
      oldValue: any,
      newValue: any,
    }>,
  }
  ```
- **Subscribers:**
  - Audit Log: Records metadata/image edits
  - Dashboard: Updates "Recent Activity" widget

### `media.deleted`

- **Airtable Record:** `recYp4GQ2bBuGMLmL`
- **Event Code:** `media.deleted`
- **Type:** Media
- **Triggered By:** `media.delete`, `media.bulkDelete`
- **Payload:**
  ```typescript
  {
    mediaId: Id<"media">,         // Note: media no longer exists after this event
    fileName: string,
    deletedBy: string,            // user identifier
    mediaType: MediaType,
    fileSize: number,             // Freed storage space in bytes
  }
  ```
- **Subscribers:**
  - Site Notification: Info toast ("{fileName} deleted")
  - Audit Log: Records permanent deletion
  - Post System: Clears `featuredImageId` on referencing posts
  - Dashboard: Updates media counts

---

## Admin Routes & UI

### Media Library (`/admin/media`)

- **Airtable Record:** `recHglega1tB192GB`
- **Purpose:** WordPress-style media library with Grid View and List View toggle. Browse, search, filter, and manage all uploaded media.
- **WordPress Equivalent:** `upload.php` (Media Library screen)
- **Layout:** `_admin` (sidebar + topbar)
- **Auth:** Required (Administrator, Editor, Author)
- **Key Components:**
  - **Page Header:** "Media Library" title + "Add New" button (links to `/admin/media/upload`)
  - **View Toggle:** Grid View (icon: grid) / List View (icon: list). Preference persisted in localStorage.
  - **Type Filter Tabs:** All | Images | Video | Audio | Documents | Unattached. Each shows count in parentheses.
  - **Filter Bar:** Date dropdown (month/year), media type dropdown (in list view), search input (debounced 300ms).
  - **Grid View Content:** Responsive thumbnail grid (4-6 columns). Images show actual thumbnail (medium size). Non-images show file type icon. Click navigates to `/admin/media/$mediaId/edit`. Processing items show spinner overlay. Failed items show error icon. Bulk select mode via "Bulk Select" button.
  - **List View Content:** WordPress-style table. Columns: checkbox, thumbnail (60x60), file (title + filename), author, attached to, date. Row actions on hover: Edit | Delete Permanently | View | Copy URL. Sortable columns: file, author, date.
  - **Pagination:** Grid: 40/page. List: 20/page. Cursor-based.
  - **Bulk Actions (List View):** Dropdown with "Delete Permanently" + Apply button.
  - **Bulk Select (Grid View):** Floating action bar at bottom with "Delete Selected (N)" button.
- **Data Requirements:** `queries/media.list`, `queries/media.counts`, `queries/users.list`
- **User Interactions:** View toggle, type tab filtering, search, bulk select/delete, click to edit, copy URL.
- **Real-Time:** Live updates via Convex subscriptions when any user uploads/edits/deletes media.
- **Role-Based Behavior:**
  - Authors: See all media. Can only edit/delete their own. Others' media shows only "View" and "Copy URL".
  - Editors/Admins: Full access to all media.
  - Contributors/Subscribers: Cannot access (redirect to dashboard).

### Upload Media (`/admin/media/upload`)

- **Airtable Record:** `rec31v3uOND1HU8zB`
- **Purpose:** Dedicated upload screen with drag-and-drop multi-file upload.
- **WordPress Equivalent:** `media-new.php` (Add New Media screen)
- **Layout:** `_admin`
- **Auth:** Required (Administrator, Editor, Author)
- **Key Components:**
  - **Drop Zone:** Large dashed-border drag-and-drop area. "Drag files here to upload" text. "Select Files" button (native file picker with `accept` filter). Max size and allowed types indicators. Visual feedback on drag-over. Multi-file support.
  - **Upload Progress Section:** Per-file rows with: small thumbnail preview or icon, filename, file size, progress bar with percentage, status text ("Uploading...", "Generating thumbnails...", "Done", "Failed: {error}"), cancel button. Max 3 concurrent uploads.
  - **Recently Uploaded Section:** Session's uploads, most recent first. Inline quick-edit fields: Title, Alt Text (images only), Caption. "Edit" link to full edit page. "View" link to open file. Auto-save with 500ms debounce.
- **Data Requirements:** `queries/settings.get` (max upload size, allowed file types)
- **Validation:** Client-side checks before upload (file size, MIME type). Server-side re-validation. Invalid files show error toast.

### Edit Media (`/admin/media/$mediaId/edit`)

- **Airtable Record:** `rec7GKjRD3LQYuPYO`
- **Purpose:** Full media editing screen with metadata editing, image editing tools, file details, and EXIF data.
- **WordPress Equivalent:** `post.php?post=X&action=edit` (attachment edit screen)
- **Layout:** `_admin`
- **Auth:** Required (Administrator, Editor; Author own only)
- **Key Components:**
  - **File Preview (left column):** Images rendered at max 600px wide. Videos: video player. Audio: audio player. Documents: file type icon. Dimensions displayed below. "Edit Image" button (images only).
  - **Metadata Form (right column):** Title, Alt Text (images only with helper text), Caption, Description, Slug. Auto-save with debounce or explicit "Save Changes" button.
  - **File Details Panel (read-only):** Filename, file type, file size (human-readable), dimensions, uploaded date, uploaded by, file URL with "Copy" button.
  - **Attached To Panel:** Parent post title + link (if attached). "Detach" option. "Not attached to any content" if unattached.
  - **EXIF Data Panel (collapsible, images only):** Camera, aperture, focal length, ISO, shutter speed, date taken, GPS (map link), copyright, credit, keywords.
  - **Image Sizes Panel:** Table of generated sizes (name, dimensions, file size). "View" link per size. "Regenerate Thumbnails" button.
  - **Image Editor (expanded inline):** Canvas with image. Toolbar: Crop, Rotate CW/CCW, Flip H/V, Scale. Crop: draggable selection, aspect ratio presets (free, 1:1, 4:3, 16:9), numeric coordinate inputs, apply-to selector (all sizes / thumbnail only). Scale: width/height inputs with locked aspect ratio toggle, can only downscale. "Apply Changes" button, "Revert to Original" button, "Cancel Editing" button.
  - **Delete Media Button:** Destructive action requiring confirmation dialog.
- **Data Requirements:** `queries/media.get`, `queries/posts.get` (for attached post info)
- **Role-Based Behavior:**
  - Authors: Can edit only their own uploads. Cannot access others' edit page (redirect to Media Library).
  - Editors/Admins: Full edit access for all media.
  - Contributors/Subscribers: Cannot access (redirect to dashboard).

### Media Upload API (`/api/admin/media/upload`)

- **Airtable Record:** `recHbShe2YL5YY8JW`
- **Purpose:** API endpoint for programmatic media uploads (Content Editor inline images, chunk uploads).
- **Auth:** Required (Administrator only)
- **Implementation:** Accepts `multipart/form-data` POST, validates auth via auth session, forwards to `media.upload` Convex action, returns JSON `{ mediaId, url, sizes }`.

---

## Website Routes

The Media System does not have dedicated website routes. Media is served via Convex storage URLs directly. The system provides the image rendering infrastructure used by all website pages.

### MediaImage Component (Shared)

```typescript
function MediaImage({
  mediaId,
  size = "large",
  className,
  priority = false,
}: {
  mediaId: Id<"media">;
  size?: "thumbnail" | "medium" | "medium_large" | "large" | "full";
  className?: string;
  priority?: boolean;
}) {
  const media = useQuery(api.media.get, { mediaId });
  const srcSet = useQuery(api.media.getSrcSet, { mediaId });

  if (!media) return <ImagePlaceholder className={className} />;

  return (
    <img
      src={media.sizes[size]?.url ?? media.url}
      srcSet={srcSet}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 75vw, 800px"
      alt={media.altText ?? ""}
      width={media.sizes[size]?.width ?? media.width}
      height={media.sizes[size]?.height ?? media.height}
      loading={priority ? "eager" : "lazy"}
      className={className}
    />
  );
}
```

**Usage contexts:**
- Featured images: `large` size as `src` with full `srcset`
- Inline content images: `medium` or `large` based on block width setting
- Thumbnails: Comment author avatars, related post cards, archive listings

### MediaPicker Component (Used in Post/Page Editor)

Inline expandable panel or sheet (NOT a modal) for selecting media within editors.

```typescript
interface MediaPickerProps {
  onSelect: (mediaId: Id<"media">) => void;
  allowedTypes?: MediaType[];
  selectedId?: Id<"media">;
  label?: string;  // "Set Featured Image", "Insert Image", etc.
}
```

**Behavior:** Mini media library with search/filter, "Upload New" tab, selection with blue checkmark, "Use This Media" confirmation button.

---

## Notifications

### Email Notifications

| Name | Airtable | Event | Recipients | Priority | Subject |
|------|----------|-------|------------|----------|---------|
| Media Storage Warning | `recaxnRcVkfoBShvN` | `media.uploaded` | Admin (Administrators only) | Batched | "Storage usage approaching limit" |

**Media Storage Warning Details:**
- Content: Current usage, percentage, file count, top 5 largest files, link to Media Library, cleanup recommendation.
- Conditions: Only sent at 75%, 90%, 95% thresholds. Each threshold sent only once (tracked via `_storage_warning_sent_{threshold}` setting). Only to Administrators.

### Site Notifications

| Name | Airtable | Event | Type | Persistent | Recipients |
|------|----------|-------|------|-----------|------------|
| Media Uploaded | `rec2Y1PYyBvGrGv52` | `media.uploaded` | Success (green) | No (5s auto-dismiss) | Employee (uploader) |
| Media Deleted | `rechy0B5X0WI9Mlf4` | `media.deleted` | Info (blue) | No (5s auto-dismiss) | Employee (deleter) |

**Notes:**
- Upload notification aggregates: shows total count rather than one per file. Waits until all files in a batch complete.
- Delete notification: No "Undo" action (permanent deletion). Bulk deletes aggregate: "{count} media items permanently deleted".

---

## Role & Capability Matrix

### Capabilities

| Capability | Slug | Description |
|-----------|------|-------------|
| Upload Files | `upload_files` | Upload media, edit own, delete own |
| Edit Others' Media | `edit_others_media` | Edit metadata/image for any user's uploads |
| Delete Others' Media | `delete_others_media` | Delete any user's uploads |
| Read Media | (all authenticated) | View media library |

### Capability-to-Role Mapping

| Capability | Administrator | Editor | Author | Contributor | Subscriber |
|-----------|:---:|:---:|:---:|:---:|:---:|
| `upload_files` | Yes | Yes | Yes | No | No |
| `edit_others_media` | Yes | Yes | No | No | No |
| `delete_others_media` | Yes | Yes | No | No | No |
| Read Media | Yes | Yes | Yes | Yes | Yes |

### Action-to-Capability Summary

| Action | Own Media | Others' Media |
|--------|-----------|---------------|
| Upload Media | `upload_files` | N/A |
| Read Media | Authenticated | Authenticated |
| Update Metadata | `upload_files` | `edit_others_media` |
| Crop/Rotate/Flip/Scale | `upload_files` | `edit_others_media` |
| Revert Image | `upload_files` | `edit_others_media` |
| Delete Media | `upload_files` | `delete_others_media` |
| Bulk Delete Media | `delete_others_media` | `delete_others_media` |

### Route Access

| Route | Administrator | Editor | Author | Contributor | Subscriber |
|-------|:---:|:---:|:---:|:---:|:---:|
| `/admin/media` (Library) | Yes | Yes | Yes | No | No |
| `/admin/media/upload` | Yes | Yes | Yes | No | No |
| `/admin/media/$mediaId/edit` | Yes (all) | Yes (all) | Yes (own only) | No | No |
| `/api/admin/media/upload` | Yes | No | No | No | No |

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|----------------|
| **Auth System** | Hard | Convex Auth user identity for every upload/edit/delete. JWT validation in Convex functions. |
| **Role & Capability System** | Hard | Capability checks (`upload_files`, `edit_others_media`, `delete_others_media`) on every mutation/action. Role lookup for ownership-based access control. |
| **Settings System** | Medium | Image size configuration (thumbnail/medium/large dimensions, crop settings). Max upload size. Allowed file types list. Falls back to defaults if Settings unavailable. |
| **Event Dispatcher System** | Medium | All media actions emit events (`media.uploaded`, `media.updated`, `media.deleted`). Notifications and audit logging depend on events being dispatched. |

### Depended On By

| System | Type | What They Need |
|--------|------|----------------|
| **Post System** | Hard | Featured images reference media via `featuredImageId`. Media picker in post editor. `media.deleted` event triggers clearing `featuredImageId`. |
| **Page System** | Hard | Same featured image pattern as posts. Media picker in page editor. |
| **Content Editor System** | Hard | Inline images, galleries, file blocks reference media items. Image block needs media picker. Upload API for inline uploads. |
| **User Profile System** | Medium | User avatars may reference media items. |
| **SEO System** | Medium | Open Graph images reference media items. Schema.org image references. |
| **Dashboard System** | Soft | Media counts, storage usage stats, recent uploads for dashboard widgets. |
| **Audit Log System** | Soft | Media events recorded in audit log. |
| **Email Notification System** | Soft | Storage warning email notifications. |
| **Site Notification System** | Soft | Upload success and deletion toast notifications. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex Auth** | User identity, session tokens, user metadata (uploader info) |
| **Convex** | Database storage, reactive queries, file storage API, scheduled functions, internal actions |
| **Sharp** (npm) | Server-side image processing (resize, crop, rotate, flip) within Convex actions |
| **exif-parser** (npm) | EXIF metadata extraction from JPEG/TIFF images |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/media/schema.ts` - 3 tables (`media`, `mediaSizes`, `mediaMeta`)
- [ ] `convex/media/queries.ts` - 4 queries (`get`, `list`, `counts`, `getSrcSet`)
- [ ] `convex/media/mutations.ts` - 3 mutations (`update`, `delete`, `bulkDelete`) + 1 internal (`setStatus`)
- [ ] `convex/media/actions.ts` - 7 actions (`upload`, `processImage` (internal), `crop`, `rotate`, `flip`, `scale`, `revert`)
- [ ] `convex/media/helpers.ts` - Helper functions (`validateFileType`, `categorizeMediaType`, `getMediaUrl`, `getMediaSrc`, `buildSrcSet`)
- [ ] `convex/media/mediaAuth.ts` - Auth helper (`checkMediaCapability`)
- [ ] `convex/media/events.ts` - Event emission helper (`emitMediaEvent`)

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/routes/_admin/media/index.tsx` - Media Library page (grid/list views)
- [ ] `src/routes/_admin/media/upload.tsx` - Upload Media page
- [ ] `src/routes/_admin/media/$mediaId/edit.tsx` - Edit Media page
- [ ] `src/components/media/MediaGrid.tsx` - Grid view component
- [ ] `src/components/media/MediaList.tsx` - List view component
- [ ] `src/components/media/MediaCard.tsx` - Thumbnail card for grid view
- [ ] `src/components/media/MediaRow.tsx` - Row component for list view
- [ ] `src/components/media/DropZone.tsx` - Drag-and-drop upload zone
- [ ] `src/components/media/UploadProgress.tsx` - Upload progress per file
- [ ] `src/components/media/ImageEditor.tsx` - Inline image editor (crop, rotate, flip, scale)
- [ ] `src/components/media/CropTool.tsx` - Crop overlay with aspect ratio presets
- [ ] `src/components/media/MediaDetails.tsx` - File details panel
- [ ] `src/components/media/ExifPanel.tsx` - EXIF data display panel
- [ ] `src/components/media/ImageSizesPanel.tsx` - Generated sizes display
- [ ] `src/components/media/MediaPicker.tsx` - Inline media picker for post/page editors
- [ ] `src/components/media/MediaFilterTabs.tsx` - Type filter tabs with counts
- [ ] `src/components/media/MediaFilterBar.tsx` - Date/type/search filter bar
- [ ] `src/components/media/BulkActions.tsx` - Bulk select and delete controls

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/components/media/MediaImage.tsx` - Responsive image component with srcset
- [ ] `src/components/media/ImagePlaceholder.tsx` - Placeholder while media loads

---

## Edge Cases & Gotchas

1. **Upload During Disconnection:** User starts uploading, loses internet. Show "Upload failed" with retry button. Convex handles partial uploads gracefully. No dangling media records because record is created after storage succeeds.

2. **Large Image Processing:** 50MB image takes time for thumbnail generation. Upload returns immediately with `status: "processing"`. Library shows spinner overlay. Failed processing shows error with "Retry" button. Original file still accessible even if thumbnails fail.

3. **Concurrent Uploads:** Multiple users uploading simultaneously. Each upload is independent (no locking). Library updates in real-time for all connected users. Slug generation handles uniqueness.

4. **Storage Quota:** Warning emails at 75%, 90%, 95% thresholds (each sent once). Upload fails with clear error when limit reached.

5. **Referenced Media Deletion:** Deleting a media item used as featured image or inline in content. Featured images: `media.deleted` event triggers Post System to clear `featuredImageId`. Inline content: NOT automatically cleaned (matches WordPress). Shows as broken image. Confirmation dialog should warn: "This media is used in N posts."

6. **Image Format Conversion:** User uploads TIFF/BMP. Accept if MIME type allowed. Generated sizes may be converted to JPEG/WebP. Original preserved in native format.

7. **Corrupt Image:** File with image MIME type but invalid data. Processing catches error, sets `status: "failed"`. Original file still stored.

8. **SVG Security:** SVGs can contain embedded JavaScript. Sanitize on upload using DOMPurify. SVGs do NOT generate image sizes (scalable by nature).

9. **Duplicate Uploads:** Allow duplicate uploads (matches WordPress). Each gets unique slug. No automatic deduplication.

10. **Zero-Byte Files:** Reject with validation error: "File is empty (0 bytes)."

11. **Convex Storage URL Lifetime:** URLs may be temporary. Store `storageId` and re-resolve from `storageId` if needed. The `url` field is a cache.

12. **Sharp in Convex Actions:** Verify Sharp npm package works in Convex action runtime. Fallback alternatives: `jimp` (pure JS), external image processing API.

13. **No Media Trash:** Deletion is permanent. No undo. This matches WordPress behavior. The confirmation dialog is the only safeguard.

14. **No Attachment Pages:** No dedicated permalink pages for media items. This is intentional (SEO-negative, rarely used in WordPress).

15. **Media Picker is NOT a Modal:** Per project rules, no modals for content management. Media picker is an inline panel or sheet component within the editor.

16. **EXIF Privacy:** Preserve EXIF in original file. Strip EXIF from generated sizes for privacy and smaller file sizes.

17. **Pagination Strategy:** Grid view: 40 items/page. List view: 20 items/page. Use cursor-based pagination for efficient large-library navigation.

18. **Bulk Delete Limit:** Max 100 items per request. Process sequentially within mutation to avoid timeout. Show progress for operations on more than 10 items.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `wp_handle_upload()` | `media.upload` action | Convex action stores file, creates record, schedules processing |
| `wp_insert_attachment()` | Part of `media.upload` | Record insertion is part of the upload action |
| `wp_generate_attachment_metadata()` | `internal.media.processImage` action | Async scheduled action generates sizes using Sharp |
| `wp_get_attachment_url()` | `getMediaUrl()` helper | Returns URL for full or specific size |
| `wp_get_attachment_image()` | `MediaImage` component | React component rendering `<img>` with srcset |
| `wp_get_attachment_image_src()` | `getMediaSrc()` helper | Returns `{ url, width, height }` for specific size |
| `wp_delete_attachment()` | `media.delete` mutation | Deletes record, storage files, sizes, meta, clears references |
| `wp_get_image_editor()` | `media.crop` / `media.rotate` / `media.flip` actions | Server-side image manipulation via Sharp |
| `image_downsize()` | `mediaSizes` table lookup | Specific size lookup via `by_media_size` index |
| `wp_get_attachment_image_srcset()` | `buildSrcSet()` helper | Generates srcset from all mediaSizes entries |
| `wp_check_filetype()` | `validateFileType()` helper | Validates MIME type + extension match |
| `wp_unique_filename()` | Convex storage handles | Storage IDs are unique; slugs use `generateUniqueSlug()` |
| `wp_upload_dir()` | N/A | Convex manages storage; no filesystem paths |
| `add_attachment` hook | `media.uploaded` event | Emitted after upload and record creation |
| `edit_attachment` hook | `media.updated` event | Emitted after metadata or image edit |
| `delete_attachment` hook | `media.deleted` event | Emitted before record deletion |
| `wp_handle_upload_prefilter` hook | Pre-upload validation in action | MIME type and size validation before storage |
| `current_user_can('upload_files')` | `checkMediaCapability(ctx, userId, media, "upload")` | Capability check in Convex function |
| `current_user_can('edit_others_posts')` (for media) | `checkMediaCapability(ctx, userId, media, "edit")` | Ownership-aware capability check |
