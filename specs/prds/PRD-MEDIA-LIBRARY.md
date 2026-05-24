# PRD: Media Library

> **System Code:** PLT-MED
> **Phase:** 1 of 6
> **Priority:** P0 - Critical
> **Complexity:** Medium

---

## 1. Overview

### 1.1 Purpose

The Media Library provides centralized asset management for all uploaded files in the e-commerce platform. Following WordPress's proven media library pattern, it handles image uploads, automatic size generation, metadata management, and seamless integration with products, categories, and marketing content.

**WordPress-Inspired Design Philosophy:**
- **Attachments as first-class entities** - Media items have their own identity, not just file references
- **Rich metadata** - Title, alt text, caption, description for SEO and accessibility
- **Automatic image sizes** - Generate optimized variants on upload
- **Reusable media modal** - Consistent UI for selecting media across all admin interfaces
- **Non-destructive** - Original files always preserved

### 1.2 Scope

**In Scope:**
- Media table with full metadata (WordPress attachment model)
- Multi-file upload with drag-and-drop
- Automatic image size generation (thumbnail, medium, large, full)
- Media library browser with grid/list views
- Search and filtering (by type, date, attachment status)
- Media modal component for use in product editor, category editor, etc.
- Bulk selection and operations
- Image optimization on upload
- CDN delivery via UploadThing or Convex file storage
- Alt text, caption, title, description fields
- Attachment tracking (which products use which images)

**Out of Scope:**
- Video transcoding (upload only, no processing)
- Audio waveform generation
- Document preview generation (PDF thumbnails, etc.)
- External media imports (URL imports)
- AI-powered alt text generation (future enhancement)

### 1.3 Out of Scope

- **Image editing** - Crop, rotate, filters (future enhancement)
- **Focal point selection** - Smart cropping (future enhancement)
- **Media folders/organization** - Flat library like WordPress (tags could be added later)
- **Version history** - File replacement tracking (future enhancement)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Authentication | PLT-AUT | 0 | User identity for upload ownership and permissions |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Product Catalog | CAT-PRD | 2 | Product images (featured, gallery) |
| Category System | CAT-CAT | 3 | Category hero images |
| Reviews & Ratings | CON-REV | 5 | User-uploaded review photos |

### 2.3 Integration Hooks to Implement

```typescript
// Media selection modal - reusable across admin
interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: Media | Media[]) => void;
  multiple?: boolean;           // Allow multi-select
  allowedTypes?: MediaType[];   // Filter by type
  selectedIds?: Id<"media">[];  // Pre-selected items
}

// Media item with all sizes
interface MediaWithSizes {
  id: Id<"media">;
  originalUrl: string;
  sizes: {
    thumbnail: string;  // 150x150
    medium: string;     // 300x300
    large: string;      // 1024x1024
    full: string;       // Original dimensions
  };
  metadata: MediaMetadata;
}

// Attachment helper - track media usage
async function attachMedia(
  mediaId: Id<"media">,
  entityType: "product" | "category" | "review",
  entityId: Id<any>
): Promise<void>;

async function detachMedia(
  mediaId: Id<"media">,
  entityType: "product" | "category" | "review",
  entityId: Id<any>
): Promise<void>;
```

---

## 3. Routes

> Source: Airtable Routes table

### 3.1 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Media Library | `/admin/media` | _admin | Yes | Manager, Admin |
| Product Editor | `/admin/products/:id` | _admin | Yes | Manager, Admin |

> Note: The Media Library is primarily accessed via the dedicated `/admin/media` route, but the media modal is embedded in product editor, category editor, and other admin forms.

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// WordPress-style attachment model
media: defineTable({
  // File information
  filename: v.string(),           // Original filename
  mimeType: v.string(),           // image/jpeg, image/png, application/pdf, etc.
  fileSize: v.number(),           // Bytes

  // Storage URLs (UploadThing or Convex storage)
  storageId: v.string(),          // Storage provider ID
  url: v.string(),                // Original file URL

  // Generated sizes (images only)
  sizes: v.optional(v.object({
    thumbnail: v.optional(v.object({
      url: v.string(),
      width: v.number(),
      height: v.number(),
    })),
    medium: v.optional(v.object({
      url: v.string(),
      width: v.number(),
      height: v.number(),
    })),
    large: v.optional(v.object({
      url: v.string(),
      width: v.number(),
      height: v.number(),
    })),
  })),

  // Original dimensions (images only)
  width: v.optional(v.number()),
  height: v.optional(v.number()),

  // WordPress-style metadata
  title: v.string(),              // Display title (defaults to filename)
  altText: v.optional(v.string()), // Alt attribute for accessibility/SEO
  caption: v.optional(v.string()), // Short caption
  description: v.optional(v.string()), // Long description

  // Ownership and status
  uploadedBy: v.id("users"),
  status: v.union(
    v.literal("processing"),      // Being uploaded/processed
    v.literal("active"),          // Available for use
    v.literal("deleted")          // Soft deleted
  ),

  // Type classification
  type: v.union(
    v.literal("image"),
    v.literal("document"),
    v.literal("video"),
    v.literal("audio"),
    v.literal("other")
  ),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_type", ["type"])
  .index("by_uploaded_by", ["uploadedBy"])
  .index("by_created", ["createdAt"])
  .index("by_mime_type", ["mimeType"]),

// Track which entities use which media (like WordPress postmeta)
mediaAttachments: defineTable({
  mediaId: v.id("media"),
  entityType: v.union(
    v.literal("product"),
    v.literal("product_gallery"),  // Distinguish featured vs gallery
    v.literal("category"),
    v.literal("review"),
    v.literal("banner")
  ),
  entityId: v.string(),           // ID of the entity (product, category, etc.)
  position: v.optional(v.number()), // For ordering in galleries
  createdAt: v.number(),
})
  .index("by_media", ["mediaId"])
  .index("by_entity", ["entityType", "entityId"])
  .index("by_media_and_entity", ["mediaId", "entityType", "entityId"]),
```

### 4.2 Relationships

```
media
  ├── users (many:1) - Uploaded by user
  └── mediaAttachments (1:many) - Usage tracking
        └── products, categories, reviews (polymorphic)

Product → Media (via mediaAttachments)
  ├── featuredImage (product, position: 0)
  └── galleryImages (product_gallery, position: 1, 2, 3...)

Category → Media (via mediaAttachments)
  └── heroImage (category)

Review → Media (via mediaAttachments)
  └── photos (review, position: 0, 1, 2...)
```

### 4.3 Forward-Looking Fields

| Field | Future System | Purpose |
|-------|---------------|---------|
| `altText` | SEO System | Image SEO optimization |
| `caption` | Content Marketing | Image captions in galleries |
| `description` | Content Marketing | Extended image descriptions |
| `mediaAttachments.entityType` | Reviews | Support user-uploaded review photos |

### 4.4 Image Size Specifications

Following WordPress conventions with e-commerce optimizations:

| Size | Max Dimensions | Use Case |
|------|----------------|----------|
| `thumbnail` | 150 × 150 | Admin grid, cart line items |
| `medium` | 300 × 300 | Product cards, category thumbnails |
| `large` | 1024 × 1024 | Product detail, lightbox |
| `full` | Original | High-res zoom, download |

**Resize Strategy:**
- **Contain** (not crop) - Preserve aspect ratio
- **WebP conversion** - Modern format with JPEG fallback
- **Quality**: thumbnail 80%, medium 85%, large 90%
- **Lazy generation** - Generate sizes on first request (optional optimization)

---

## 5. Actions

> Source: Airtable Actions table

### 5.1 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Upload Media | `media.upload` | Upload image or file to media library | Staff, Manager, Admin |
| Browse Media Library | `media.browse` | View and search media library | Staff, Manager, Admin |
| Delete Media | `media.delete` | Remove file from media library | Manager, Admin |

### 5.2 Extended Actions (Not in Airtable)

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Update Media Metadata | `media.update` | Edit title, alt, caption, description | Staff, Manager, Admin |
| Bulk Delete Media | `media.bulk_delete` | Delete multiple files at once | Manager, Admin |
| Attach Media | `media.attach` | Link media to product/category/review | Staff, Manager, Admin |
| Detach Media | `media.detach` | Unlink media from entity | Staff, Manager, Admin |
| Reorder Gallery | `media.reorder` | Change image order in gallery | Staff, Manager, Admin |

---

## 6. Events

> Source: Airtable Events table

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Media Uploaded | `media.uploaded` | File successfully uploaded and processed | `{ mediaId: Id, filename: string, type: MediaType, uploadedBy: Id }` |
| Media Deleted | `media.deleted` | File removed from library | `{ mediaId: Id, filename: string, deletedBy: Id }` |
| Media Updated | `media.updated` | Metadata changed | `{ mediaId: Id, changedFields: string[], updatedBy: Id }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `user.account_deleted` | Customer Accounts | Clean up user's uploaded media (reviews) |

---

## 7. Notifications

### 7.1 Email Notifications

None - Media operations don't trigger customer-facing emails.

### 7.2 Site Notifications

| Name | Trigger Event | Recipient | Message Template | Type |
|------|---------------|-----------|------------------|------|
| Upload Complete | `media.uploaded` | Uploader | "{{count}} file(s) uploaded successfully" | Success |
| Upload Failed | `media.upload_failed` | Uploader | "Failed to upload {{filename}}: {{error}}" | Error |

---

## 8. User Interface

### 8.1 Components Needed

**Media Library Page:**
- [ ] `MediaLibraryPage` - Main library view with header actions
- [ ] `MediaGrid` - Grid view of media items with selection
- [ ] `MediaListView` - Table view alternative
- [ ] `MediaCard` - Individual media item in grid
- [ ] `MediaFilters` - Type, date, attachment status filters
- [ ] `MediaSearch` - Search input with debounce
- [ ] `MediaBulkActions` - Bulk delete, bulk download
- [ ] `MediaUploadZone` - Drag-drop upload area
- [ ] `MediaUploadProgress` - Upload progress indicator

**Media Detail/Edit:**
- [ ] `MediaDetailPanel` - Side panel or modal for editing
- [ ] `MediaMetadataForm` - Title, alt, caption, description fields
- [ ] `MediaPreview` - Full-size preview with size selector
- [ ] `MediaAttachmentsList` - Show where media is used

**Reusable Media Modal (WordPress-style):**
- [ ] `MediaModal` - Full-screen modal for media selection
- [ ] `MediaModalTabs` - "Upload" / "Media Library" tabs
- [ ] `MediaModalUpload` - Upload tab content
- [ ] `MediaModalLibrary` - Browse tab with selection
- [ ] `MediaModalSelection` - Selected items sidebar
- [ ] `MediaModalActions` - Insert/Select button

**Product Integration:**
- [ ] `ProductImageUploader` - Featured image + gallery for product editor
- [ ] `GalleryReorder` - Drag-drop reordering of gallery images
- [ ] `ImageSelector` - Click-to-select from library

### 8.2 Wireframes

**Media Library Page:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Media Library                                    [Upload Files ▲]  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────┐  ┌─────────┐ ┌─────────┐      │
│  │ 🔍 Search media...              │  │ All ▼   │ │ ≡  ⊞   │      │
│  └─────────────────────────────────┘  └─────────┘ └─────────┘      │
│                                                                     │
│  ☐ Select All                              3 selected  [Delete]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ ☐        │  │ ☑        │  │ ☑        │  │ ☐        │           │
│  │  [img]   │  │  [img]   │  │  [img]   │  │  [img]   │           │
│  │          │  │          │  │          │  │          │           │
│  │ photo1   │  │ banner   │  │ product  │  │ hero.jpg │           │
│  │ 1.2 MB   │  │ 2.4 MB   │  │ 890 KB   │  │ 3.1 MB   │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ ☐        │  │ ☑        │  │ ☐        │  │ ☐        │           │
│  │  [img]   │  │  [img]   │  │  [doc]   │  │  [img]   │           │
│  │          │  │          │  │          │  │          │           │
│  │ prod-2   │  │ cat-hero │  │ spec.pdf │  │ variant  │           │
│  │ 456 KB   │  │ 1.8 MB   │  │ 234 KB   │  │ 567 KB   │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                     │
│  ─────────────────── Load More ───────────────────                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Media Modal (WordPress-style):**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Insert Media                                              [×]      │
├────────────────┬────────────────────────────────────────────────────┤
│                │                                                    │
│  ┌──────────┐  │  ┌─────────────────────────────────────────────┐  │
│  │ Upload   │  │  │ 🔍 Search...                    Images ▼    │  │
│  │ Files    │  │  └─────────────────────────────────────────────┘  │
│  └──────────┘  │                                                    │
│                │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐      │
│  ┌──────────┐  │  │ ☐  │ │ ☑  │ │ ☐  │ │ ☑  │ │ ☐  │ │ ☐  │      │
│  │ Media    │◀─│  │img │ │img │ │img │ │img │ │img │ │img │      │
│  │ Library  │  │  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘      │
│  └──────────┘  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐      │
│                │  │ ☐  │ │ ☐  │ │ ☐  │ │ ☐  │ │ ☐  │ │ ☐  │      │
│                │  │img │ │img │ │img │ │img │ │img │ │img │      │
│                │  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘      │
│                │                                                    │
├────────────────┴────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ATTACHMENT DETAILS                                          │   │
│  │                                                             │   │
│  │ Title:       [product-hero.jpg____________]                 │   │
│  │ Alt Text:    [Red running shoes on white__]                 │   │
│  │ Caption:     [_____________________________]                │   │
│  │ Description: [_____________________________]                │   │
│  │                                                             │   │
│  │ Uploaded: Jan 30, 2025  │  Size: 1.2 MB  │  1920 × 1080    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                              [Cancel]  [Insert 2 images]            │
└─────────────────────────────────────────────────────────────────────┘
```

**Product Image Gallery Editor:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Product Images                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Featured Image                      Gallery Images                 │
│  ┌─────────────────┐                ┌──────┐ ┌──────┐ ┌──────┐    │
│  │                 │                │  1   │ │  2   │ │  3   │    │
│  │                 │                │ [img]│ │ [img]│ │ [img]│    │
│  │     [image]     │                │  ×   │ │  ×   │ │  ×   │    │
│  │                 │                └──────┘ └──────┘ └──────┘    │
│  │                 │                ┌──────┐                       │
│  │    [Change]     │                │  +   │ Add images            │
│  └─────────────────┘                │      │                       │
│  [Remove]                           └──────┘                       │
│                                                                     │
│  Drag to reorder gallery images                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 States

**Upload States:**
- Idle (ready to upload)
- Dragging (file over drop zone)
- Uploading (progress bar)
- Processing (generating sizes)
- Complete (success checkmark)
- Failed (error message with retry)

**Library States:**
- Loading (skeleton grid)
- Empty (no media, prompt to upload)
- Filtered (showing filter results)
- No results (search with no matches)
- Selection mode (items selected)

**Media Detail States:**
- Viewing (read-only)
- Editing (form visible)
- Saving (loading indicator)
- Deleting (confirmation dialog)

---

## 9. Business Rules

### 9.1 Validation Rules

**File Upload:**
- Max file size: 10 MB (images), 50 MB (documents/video)
- Allowed image types: JPEG, PNG, GIF, WebP, SVG
- Allowed document types: PDF
- Allowed video types: MP4, WebM (optional)
- Filename sanitization: Remove special characters, spaces to hyphens

**Metadata:**
- Title: Required, max 255 characters (defaults to filename)
- Alt text: Optional, max 500 characters
- Caption: Optional, max 500 characters
- Description: Optional, max 2000 characters

### 9.2 Business Logic

**Upload Flow:**
1. Validate file type and size
2. Generate unique filename (UUID + sanitized original)
3. Upload to storage provider (UploadThing/Convex)
4. Create media record with status `processing`
5. Trigger async size generation (images only)
6. Update status to `active` when complete
7. Dispatch `media.uploaded` event

**Size Generation Flow:**
1. Receive original image URL
2. Generate thumbnail (150×150, contain)
3. Generate medium (300×300, contain)
4. Generate large (1024×1024, contain)
5. Convert to WebP with JPEG fallback
6. Upload generated sizes to storage
7. Update media record with size URLs

**Deletion Flow:**
1. Check if media is attached to any entities
2. If attached, warn user (but allow deletion)
3. Soft delete (set status to `deleted`)
4. Hard delete after 30 days (cleanup job)
5. Delete files from storage on hard delete
6. Dispatch `media.deleted` event

**Attachment Flow:**
1. When product saves with featured image, create attachment record
2. When product adds gallery images, create attachment records with positions
3. When product removes image, delete attachment record
4. When media is deleted, cascade delete attachments

### 9.3 Edge Cases

| Scenario | Handling |
|----------|----------|
| Upload fails mid-way | Keep partial record, allow retry/delete |
| Duplicate filename | Auto-rename with UUID prefix |
| Invalid image (corrupt) | Reject with clear error message |
| Size generation fails | Keep original, mark sizes as unavailable |
| Media deleted while in use | Allow deletion, show placeholder on product |
| Large batch upload (20+) | Queue uploads, show aggregate progress |
| SVG upload | Store as-is, no size generation |
| Storage quota exceeded | Reject upload with quota message |

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// List media with pagination and filters
export const list = query({
  args: {
    type: v.optional(v.union(
      v.literal("image"),
      v.literal("document"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("other")
    )),
    status: v.optional(v.literal("active")), // Default to active only
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("media");

    // Default to active status
    const status = args.status ?? "active";
    query = query.withIndex("by_status", (q) => q.eq("status", status));

    const media = await query
      .order("desc")
      .take(args.limit ?? 50);

    // Filter by type if specified
    let filtered = args.type
      ? media.filter((m) => m.type === args.type)
      : media;

    // Search in title, filename, alt text
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      filtered = filtered.filter((m) =>
        m.title.toLowerCase().includes(searchLower) ||
        m.filename.toLowerCase().includes(searchLower) ||
        m.altText?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  },
});

// Get single media item with full details
export const get = query({
  args: { id: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.id);
    if (!media || media.status === "deleted") return null;

    // Get uploader info
    const uploader = await ctx.db.get(media.uploadedBy);

    // Get attachment count
    const attachments = await ctx.db
      .query("mediaAttachments")
      .withIndex("by_media", (q) => q.eq("mediaId", args.id))
      .collect();

    return {
      ...media,
      uploader: uploader ? { id: uploader._id, name: uploader.name, email: uploader.email } : null,
      attachmentCount: attachments.length,
      attachments: attachments,
    };
  },
});

// Get media for a specific entity (product gallery, etc.)
export const getForEntity = query({
  args: {
    entityType: v.union(
      v.literal("product"),
      v.literal("product_gallery"),
      v.literal("category"),
      v.literal("review"),
      v.literal("banner")
    ),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const attachments = await ctx.db
      .query("mediaAttachments")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();

    // Sort by position
    attachments.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Get full media details
    const media = await Promise.all(
      attachments.map(async (att) => {
        const m = await ctx.db.get(att.mediaId);
        return m && m.status === "active" ? { ...m, position: att.position } : null;
      })
    );

    return media.filter(Boolean);
  },
});

// Check if media is in use (before deletion warning)
export const getUsage = query({
  args: { id: v.id("media") },
  handler: async (ctx, args) => {
    const attachments = await ctx.db
      .query("mediaAttachments")
      .withIndex("by_media", (q) => q.eq("mediaId", args.id))
      .collect();

    // Group by entity type
    const usage = {
      products: attachments.filter((a) =>
        a.entityType === "product" || a.entityType === "product_gallery"
      ).length,
      categories: attachments.filter((a) => a.entityType === "category").length,
      reviews: attachments.filter((a) => a.entityType === "review").length,
      banners: attachments.filter((a) => a.entityType === "banner").length,
      total: attachments.length,
    };

    return usage;
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Create media record (called after file upload to storage)
export const create = mutation({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    fileSize: v.number(),
    storageId: v.string(),
    url: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) throw new Error("User not found");

    // Determine type from MIME
    const type = getMediaType(args.mimeType);

    // Create record
    const mediaId = await ctx.db.insert("media", {
      filename: args.filename,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      storageId: args.storageId,
      url: args.url,
      width: args.width,
      height: args.height,
      title: sanitizeFilename(args.filename), // Default title from filename
      uploadedBy: user._id,
      status: type === "image" ? "processing" : "active", // Images need processing
      type,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Trigger size generation for images
    if (type === "image") {
      await ctx.scheduler.runAfter(0, internal.media.generateSizes, { mediaId });
    }

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "media.uploaded",
      payload: { mediaId, filename: args.filename, type, uploadedBy: user._id },
    });

    return mediaId;
  },
});

// Update media metadata
export const update = mutation({
  args: {
    id: v.id("media"),
    title: v.optional(v.string()),
    altText: v.optional(v.string()),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const media = await ctx.db.get(args.id);
    if (!media || media.status === "deleted") {
      throw new Error("Media not found");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    const changedFields: string[] = [];

    if (args.title !== undefined) {
      updates.title = args.title;
      changedFields.push("title");
    }
    if (args.altText !== undefined) {
      updates.altText = args.altText;
      changedFields.push("altText");
    }
    if (args.caption !== undefined) {
      updates.caption = args.caption;
      changedFields.push("caption");
    }
    if (args.description !== undefined) {
      updates.description = args.description;
      changedFields.push("description");
    }

    await ctx.db.patch(args.id, updates);

    // Get user for event
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "media.updated",
      payload: { mediaId: args.id, changedFields, updatedBy: user?._id },
    });

    return { success: true };
  },
});

// Soft delete media
export const remove = mutation({
  args: { id: v.id("media") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const media = await ctx.db.get(args.id);
    if (!media || media.status === "deleted") {
      throw new Error("Media not found");
    }

    // Soft delete
    await ctx.db.patch(args.id, {
      status: "deleted",
      updatedAt: Date.now(),
    });

    // Delete all attachments
    const attachments = await ctx.db
      .query("mediaAttachments")
      .withIndex("by_media", (q) => q.eq("mediaId", args.id))
      .collect();

    for (const att of attachments) {
      await ctx.db.delete(att._id);
    }

    // Get user for event
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "media.deleted",
      payload: { mediaId: args.id, filename: media.filename, deletedBy: user?._id },
    });

    return { success: true };
  },
});

// Bulk delete media
export const bulkDelete = mutation({
  args: { ids: v.array(v.id("media")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    for (const id of args.ids) {
      const media = await ctx.db.get(id);
      if (media && media.status !== "deleted") {
        await ctx.db.patch(id, { status: "deleted", updatedAt: Date.now() });

        // Delete attachments
        const attachments = await ctx.db
          .query("mediaAttachments")
          .withIndex("by_media", (q) => q.eq("mediaId", id))
          .collect();

        for (const att of attachments) {
          await ctx.db.delete(att._id);
        }
      }
    }

    return { success: true, deletedCount: args.ids.length };
  },
});

// Attach media to entity
export const attach = mutation({
  args: {
    mediaId: v.id("media"),
    entityType: v.union(
      v.literal("product"),
      v.literal("product_gallery"),
      v.literal("category"),
      v.literal("review"),
      v.literal("banner")
    ),
    entityId: v.string(),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Check media exists
    const media = await ctx.db.get(args.mediaId);
    if (!media || media.status !== "active") {
      throw new Error("Media not found");
    }

    // Check if attachment already exists
    const existing = await ctx.db
      .query("mediaAttachments")
      .withIndex("by_media_and_entity", (q) =>
        q.eq("mediaId", args.mediaId)
         .eq("entityType", args.entityType)
         .eq("entityId", args.entityId)
      )
      .unique();

    if (existing) {
      // Update position if it changed
      if (args.position !== undefined && existing.position !== args.position) {
        await ctx.db.patch(existing._id, { position: args.position });
      }
      return existing._id;
    }

    // Create attachment
    return await ctx.db.insert("mediaAttachments", {
      mediaId: args.mediaId,
      entityType: args.entityType,
      entityId: args.entityId,
      position: args.position,
      createdAt: Date.now(),
    });
  },
});

// Detach media from entity
export const detach = mutation({
  args: {
    mediaId: v.id("media"),
    entityType: v.union(
      v.literal("product"),
      v.literal("product_gallery"),
      v.literal("category"),
      v.literal("review"),
      v.literal("banner")
    ),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const attachment = await ctx.db
      .query("mediaAttachments")
      .withIndex("by_media_and_entity", (q) =>
        q.eq("mediaId", args.mediaId)
         .eq("entityType", args.entityType)
         .eq("entityId", args.entityId)
      )
      .unique();

    if (attachment) {
      await ctx.db.delete(attachment._id);
    }

    return { success: true };
  },
});

// Reorder gallery images
export const reorderGallery = mutation({
  args: {
    entityType: v.union(v.literal("product_gallery"), v.literal("review")),
    entityId: v.string(),
    mediaIds: v.array(v.id("media")), // New order
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Update positions based on new order
    for (let i = 0; i < args.mediaIds.length; i++) {
      const attachment = await ctx.db
        .query("mediaAttachments")
        .withIndex("by_media_and_entity", (q) =>
          q.eq("mediaId", args.mediaIds[i])
           .eq("entityType", args.entityType)
           .eq("entityId", args.entityId)
        )
        .unique();

      if (attachment) {
        await ctx.db.patch(attachment._id, { position: i });
      }
    }

    return { success: true };
  },
});
```

### 10.3 Actions (External/Async Operations)

```typescript
// Generate image sizes (internal action)
export const generateSizes = internalAction({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.runQuery(internal.media.getInternal, { id: args.mediaId });
    if (!media || media.type !== "image") return;

    try {
      // Generate sizes using image processing service
      // This would use Sharp, Cloudinary, or similar
      const sizes = await generateImageSizes(media.url, {
        thumbnail: { width: 150, height: 150 },
        medium: { width: 300, height: 300 },
        large: { width: 1024, height: 1024 },
      });

      // Update media record with generated sizes
      await ctx.runMutation(internal.media.updateSizes, {
        mediaId: args.mediaId,
        sizes,
      });

    } catch (error) {
      console.error("Failed to generate sizes for", args.mediaId, error);
      // Mark as active anyway - original is still usable
      await ctx.runMutation(internal.media.markActive, { mediaId: args.mediaId });
    }
  },
});

// Generate upload URL for client-side upload
export const getUploadUrl = action({
  args: {
    filename: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Validate file type
    if (!isAllowedMimeType(args.mimeType)) {
      throw new Error("File type not allowed");
    }

    // Generate presigned URL from storage provider
    const uploadUrl = await ctx.storage.generateUploadUrl();

    return { uploadUrl };
  },
});

// Cleanup deleted media (scheduled job)
export const cleanupDeleted = internalAction({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Get deleted media older than 30 days
    const deletedMedia = await ctx.runQuery(internal.media.getDeletedOlderThan, {
      timestamp: thirtyDaysAgo,
    });

    for (const media of deletedMedia) {
      // Delete from storage
      await ctx.storage.delete(media.storageId);

      // Delete size files
      if (media.sizes) {
        // Delete generated sizes from storage
      }

      // Hard delete record
      await ctx.runMutation(internal.media.hardDelete, { id: media._id });
    }

    return { cleanedUp: deletedMedia.length };
  },
});
```

### 10.4 Helper Functions

```typescript
// Determine media type from MIME type
function getMediaType(mimeType: string): "image" | "document" | "video" | "audio" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";
  return "other";
}

// Check if MIME type is allowed
function isAllowedMimeType(mimeType: string): boolean {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "video/mp4",
    "video/webm",
  ];
  return allowed.includes(mimeType);
}

// Sanitize filename for title
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[-_]/g, " ")    // Replace dashes/underscores with spaces
    .replace(/\s+/g, " ")     // Normalize spaces
    .trim();
}

// Get best size URL for a given context
function getImageUrl(media: Media, size: "thumbnail" | "medium" | "large" | "full"): string {
  if (size === "full") return media.url;
  return media.sizes?.[size]?.url ?? media.url;
}
```

---

## 11. Security Considerations

### 11.1 Authentication Requirements

| Route/Action | Requirement |
|--------------|-------------|
| Browse Media Library | Authenticated, Staff+ role |
| Upload Media | Authenticated, Staff+ role |
| Update Metadata | Authenticated, Staff+ role |
| Delete Media | Authenticated, Manager+ role |
| Bulk Delete | Authenticated, Manager+ role |

### 11.2 Authorization Rules

- **Staff** can upload and browse media
- **Staff** can edit metadata on any media
- **Manager/Admin** can delete media
- **Customers** cannot access media library directly
- **Review photos** uploaded by customers go through moderation

### 11.3 Data Privacy

**File Security:**
- Files stored with unique, non-guessable URLs
- No directory listing on storage
- CDN caching with signed URLs (optional)

**Upload Validation:**
- Server-side MIME type validation (don't trust client)
- Image dimension limits (max 8000×8000)
- Malware scanning integration (optional)

**Access Control:**
- Media URLs are public (CDN-friendly)
- Sensitive documents should use signed URLs
- Admin-only media browse route

---

## 12. Testing Strategy

### 12.1 Unit Tests

- `getMediaType()` - MIME type classification
- `isAllowedMimeType()` - Validation logic
- `sanitizeFilename()` - Filename cleaning
- `getImageUrl()` - Size selection fallback

### 12.2 Integration Tests

- Upload flow end-to-end
- Size generation completion
- Attachment tracking (attach/detach)
- Gallery reordering
- Deletion cascade (attachments)
- Bulk operations

### 12.3 E2E Tests

- Upload single image via drag-drop
- Upload multiple images
- Browse library with filters
- Search by title/alt text
- Select media in modal
- Insert selected media into product
- Delete media with confirmation
- Edit metadata inline

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Define schema in `convex/schema.ts` (media, mediaAttachments)
- [ ] Set up UploadThing or Convex file storage
- [ ] Implement `create` mutation (basic upload)
- [ ] Implement `list` query with filters
- [ ] Implement `get` query with details

### Phase 2: Core Features
- [ ] Create `/admin/media` route
- [ ] Build `MediaLibraryPage` component
- [ ] Build `MediaGrid` with selection
- [ ] Build `MediaUploadZone` with drag-drop
- [ ] Implement `update` mutation (metadata)
- [ ] Implement `remove` mutation (soft delete)

### Phase 3: Integration
- [ ] Build `MediaModal` component (WordPress-style)
- [ ] Implement `attach` / `detach` mutations
- [ ] Implement `reorderGallery` mutation
- [ ] Build `ProductImageUploader` component
- [ ] Integrate modal into product editor
- [ ] Set up image size generation

### Phase 4: Polish
- [ ] Add bulk selection and delete
- [ ] Add search functionality
- [ ] Add usage indicator (where media is used)
- [ ] Add deletion warning when in use
- [ ] Set up cleanup cron job
- [ ] Optimize image loading (lazy load, blur placeholders)

---

## 14. Future Considerations

### Image Editing
- Crop tool with aspect ratio presets
- Rotate and flip
- Basic filters (brightness, contrast)
- Focal point selection for smart cropping

### Organization
- Folders or collections
- Tags for media
- Bulk tagging operations
- Smart albums (auto-grouped by date, product)

### Advanced Features
- AI-powered alt text generation
- Duplicate detection
- Image similarity search
- External URL imports
- Bulk import from ZIP

### Performance
- Progressive JPEG generation
- AVIF format support
- Lazy size generation on first request
- CDN cache invalidation

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System (Media Library) | [redacted-airtable-record-id] |
| Routes | [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Event System PRD](./PRD-EVENT-SYSTEM.md)
- [Auth System PRD](./PRD-AUTH-SYSTEM.md)
- [Tech Stack](../.claude/CLAUDE.md)

### C. WordPress Media Library Reference

Key WordPress patterns adopted:

| WordPress Concept | Our Implementation |
|-------------------|-------------------|
| `wp_posts` with `post_type='attachment'` | `media` table |
| `wp_postmeta` for attachment metadata | Fields on `media` table |
| `_wp_attachment_metadata` | `sizes` object |
| Featured image (`_thumbnail_id`) | `mediaAttachments` with `entityType='product'` |
| Gallery (`gallery` shortcode) | `mediaAttachments` with `entityType='product_gallery'` |
| Media modal (Add Media button) | `MediaModal` component |
| Attachment display settings | Per-insertion via modal |

### D. Storage Provider Options

| Provider | Pros | Cons |
|----------|------|------|
| **UploadThing** | Easy setup, good DX, generous free tier | Less control over processing |
| **Convex Storage** | Native integration, simple | No built-in image processing |
| **Cloudinary** | Powerful transforms, CDN | Cost at scale, complexity |
| **AWS S3 + CloudFront** | Full control, scalable | More setup required |

**Recommendation:** Start with UploadThing for simplicity, migrate to S3 if needed at scale.

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
