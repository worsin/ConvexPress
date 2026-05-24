# Media System Audit Report

**Date:** 2026-02-13
**Auditor:** Media System Expert
**Scope:** Full code review and audit of the Media System
**Mode:** AUDIT ONLY (no code modifications)

---

## Files Reviewed

### Backend (ConvexPress-Admin/packages/backend/convex/)

| File | Path | Lines |
|------|------|-------|
| Schema | `schema/media.ts` | ~85 |
| Queries | `media/queries.ts` | ~250 |
| Mutations | `media/mutations.ts` | ~380 |
| Actions | `media/actions.ts` | ~310 |
| Internals | `media/internals.ts` | ~1075 |
| Helpers | `media/helpers.ts` | ~220 |
| Auth | `media/mediaAuth.ts` | ~55 |
| Validators | `media/validators.ts` | ~85 |
| HTTP API | `http/media.ts` | ~75 |

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

| File | Path |
|------|------|
| Media Library Route | `routes/_authenticated/_admin/media/index.tsx` |
| Upload Route | `routes/_authenticated/_admin/media/upload.tsx` |
| Edit Route | `routes/_authenticated/_admin/media/$mediaId/edit.tsx` |
| MediaListTable | `components/media/MediaListTable.tsx` |
| MediaGrid | `components/media/MediaGrid.tsx` |
| DropZone | `components/media/DropZone.tsx` |
| UploadProgress | `components/media/UploadProgress.tsx` |
| MediaDetails | `components/media/MediaDetails.tsx` |
| ExifPanel | `components/media/ExifPanel.tsx` |
| ImageSizesPanel | `components/media/ImageSizesPanel.tsx` |
| MediaPicker | `components/media/MediaPicker.tsx` |
| ImageEditor | `components/media/ImageEditor.tsx` |
| CropTool | `components/media/CropTool.tsx` |

### Website Frontend (ConvexPress-Website/apps/web/src/)

| File | Path |
|------|------|
| MediaImage | `components/media/MediaImage.tsx` |
| ImagePlaceholder | `components/media/ImagePlaceholder.tsx` |

**Total files reviewed: 22**

---

## Audit Summary

| Category | Issues Found |
|----------|-------------|
| CRITICAL (Security) | 3 |
| HIGH (Functionality gaps) | 8 |
| MEDIUM (Code quality / standards) | 10 |
| LOW (Minor / improvement) | 7 |
| **TOTAL** | **28** |

### Compliance Checks

| Check | Result |
|-------|--------|
| Radix imports (`@radix-ui/*`) | PASS - None found |
| Hardcoded colors (zinc/slate/gray) | PASS - None found |
| Broken imports | PASS - All imports resolve |
| React 19 compatibility | PASS - No deprecated patterns |
| Non-standardized UI (popups for content) | PASS - All content management is full-page |
| Convex ownership model | PASS - All schema/functions in ConvexPress-Admin |

---

## CRITICAL Issues

### C1. `validateFileType` Helper Exists But Is Never Called

**Files:** `media/helpers.ts` (defines it), `media/mutations.ts` (should call it)
**Severity:** CRITICAL (Security)

The `validateFileType` function in `helpers.ts` performs comprehensive MIME type validation with extension-mismatch detection. It checks against a full `EXTENSION_MIME_MAP` and returns `{ valid, detectedType, message }`.

**However, the `create` mutation in `mutations.ts` never calls this function.** The create mutation validates filename emptiness, fileSize, title length, altText/caption/description character limits, and slug uniqueness -- but never validates the MIME type or checks for extension/MIME mismatches.

This means a user could upload a file with `mimeType: "image/jpeg"` but actually provide an executable or other dangerous file type. The server-side validation gap means the system relies entirely on client-side checks in `DropZone.tsx`, which can be bypassed.

**Impact:** Potential file type spoofing. An attacker could upload malicious files disguised as images.

**Fix:** Call `validateFileType(args.filename, args.mimeType)` in the `create` mutation handler before inserting the record.

---

### C2. `addSize` and `updateStatus` Are Public Mutations

**File:** `media/mutations.ts`
**Severity:** CRITICAL (Security)

Both `addSize` and `updateStatus` are defined as `mutation()` (public, client-callable) rather than `internalMutation()`:

```typescript
// mutations.ts
export const addSize = mutation({
  args: { ... },
  handler: async (ctx, args) => { ... },
});

export const updateStatus = mutation({
  args: { ... },
  handler: async (ctx, args) => { ... },
});
```

These are system-level operations that should only be called by internal processing pipelines (e.g., `processImageAction` in internals.ts). Making them public means any authenticated client could:
- Add arbitrary size entries to any media record
- Change any media item's status (e.g., marking failed items as active)

The code comments even acknowledge this:
```typescript
// NOTE: This should ideally be an internalMutation, but keeping as mutation
// for now since it's called from actions which can't call internal mutations directly.
```

**Impact:** Privilege escalation. Any authenticated user could manipulate media metadata.

**Fix:** Convert to `internalMutation` and call from actions via `ctx.runMutation(internal.media.internals.addSize, ...)`. Alternatively, use an internalAction that wraps the internal mutation call.

---

### C3. No SVG Sanitization

**File:** `media/helpers.ts`, `media/mutations.ts`
**Severity:** CRITICAL (Security)

The knowledge doc explicitly mentions SVG sanitization as a requirement:
> "SVG sanitization not implemented - MUST add DOMPurify or similar before allowing SVG uploads"

The `categorizeMediaType` function in `helpers.ts` categorizes `image/svg+xml` as type `"image"`. SVG files can contain embedded JavaScript, external entity references, and other XSS vectors. There is no sanitization anywhere in the upload or processing pipeline.

**Impact:** Stored XSS vulnerability if SVG uploads are permitted and served to other users.

**Fix:** Either block SVG uploads entirely or implement server-side SVG sanitization (e.g., DOMPurify) before storage.

---

## HIGH Issues

### H1. HTTP API Endpoints Are All Stubs

**File:** `http/media.ts`
**Severity:** HIGH (Missing feature)

All four HTTP API endpoints return placeholder responses:

```typescript
// GET /api/media
return new Response(JSON.stringify({ message: "Media list endpoint" }), { ... });

// GET /api/media/:id
return new Response(JSON.stringify({ message: `Media item: ${id}` }), { ... });

// POST /api/media
return new Response(JSON.stringify({ message: "Upload endpoint" }), { ... });

// DELETE /api/media/:id
return new Response(JSON.stringify({ message: `Delete media: ${id}` }), { ... });
```

None are wired to actual media queries or mutations. The knowledge doc specifies these should be functional REST endpoints for external access and the website app.

**Impact:** External API access (e.g., from the website app or third-party integrations) is non-functional.

---

### H2. `attachedTo` Field Missing from Schema

**File:** `schema/media.ts`
**Severity:** HIGH (PRD compliance)

The knowledge doc specifies an `attachedTo` field for tracking which post/page a media item is associated with:
> "attachedTo - optional reference to the content it's attached to"

This field is absent from the schema. Without it, the system cannot:
- Show which media items are "unattached" (WordPress Unattached view)
- Track media usage across posts/pages
- Prevent deletion of in-use media
- Power the "unattached" count in the counts query

**Impact:** Cannot implement WordPress-style media attachment tracking.

---

### H3. `counts` Query Fetches ALL Records

**File:** `media/queries.ts`
**Severity:** HIGH (Performance)

The `counts` query fetches every single media record to count them:

```typescript
const allMedia = await ctx.db.query("media").collect();
const counts = {
  all: allMedia.length,
  image: allMedia.filter((m) => m.type === "image").length,
  video: allMedia.filter((m) => m.type === "video").length,
  // ...
};
```

For a site with thousands of media items, this loads the entire table into memory on every call. Convex charges for bandwidth on collected documents, so this is also a cost concern.

**Impact:** Degraded performance and increased Convex bandwidth costs as the media library grows.

**Fix:** Use separate index-based queries for each count, or maintain a denormalized counts document that is updated on insert/delete.

---

### H4. Missing List Query Filters

**File:** `media/validators.ts`, `media/queries.ts`
**Severity:** HIGH (PRD compliance)

The knowledge doc specifies these list filters:
- `dateFrom` / `dateTo` (date range filtering)
- `orderBy` / `orderDir` (sorting options)
- `unattached` filter

The validators only support: `type`, `status`, `uploadedBy`, `search`, pagination options. The queries only filter by type, status, uploadedBy, and search text.

**Impact:** Users cannot filter media by date range, sort by different fields, or view unattached media.

---

### H5. EXIF Panel Key Name Mismatch

**Files:** `media/internals.ts`, `components/media/ExifPanel.tsx`
**Severity:** HIGH (Bug)

The internals store EXIF data with these meta keys (from `processImageAction`):

```typescript
// internals.ts stores:
"_exif_camera_make"
"_exif_camera_model"
"_exif_focal_length"
"_exif_exposure_time"
"_exif_f_number"
"_exif_iso"
"_exif_date_taken"
"_exif_gps_latitude"   // <-- NOTE
"_exif_gps_longitude"  // <-- NOTE
"_exif_orientation"
"_exif_software"
```

The ExifPanel component reads these keys:

```typescript
// ExifPanel.tsx reads:
metaMap?.["_exif_camera_make"]
metaMap?.["_exif_camera_model"]
metaMap?.["_exif_focal_length"]
metaMap?.["_exif_exposure_time"]
metaMap?.["_exif_f_number"]
metaMap?.["_exif_iso"]
metaMap?.["_exif_date_taken"]
metaMap?.["_exif_gps_lat"]       // <-- MISMATCH
metaMap?.["_exif_gps_lng"]       // <-- MISMATCH
```

The GPS latitude/longitude keys use different names between backend and frontend:
- Backend stores: `_exif_gps_latitude`, `_exif_gps_longitude`
- Frontend reads: `_exif_gps_lat`, `_exif_gps_lng`

**Impact:** GPS data will never display in the EXIF panel. The "View on Map" link will never appear.

---

### H6. Image Sizes Point to Original File (No Actual Resizing)

**File:** `media/internals.ts`
**Severity:** HIGH (Functionality gap)

The `processImageAction` registers WordPress-standard size variants (thumbnail, medium, medium_large, large) but all point to the same original `storageId`:

```typescript
// All sizes use the same storageId as the original
await ctx.runMutation(internal.media.internals.addSizeInternal, {
  mediaId,
  sizeName,
  width: targetWidth,
  height: targetHeight,
  storageId: media.storageId,  // <-- Same file for all sizes
  fileSize: media.fileSize,    // <-- Same size for all
});
```

This is because Sharp (the standard Node.js image processing library) is not available in the Convex runtime. The code comments acknowledge this limitation.

**Impact:** No bandwidth savings from responsive images. The `srcset` attribute serves the full-resolution image at every breakpoint. Users still download the full image regardless of viewport size.

**Note:** This is a known Convex runtime limitation. A solution would involve using a Convex action with an external image processing service, or processing images client-side before upload.

---

### H7. Missing `slug` Update in Update Mutation

**File:** `media/mutations.ts`
**Severity:** HIGH (PRD compliance)

The `update` mutation accepts and processes changes to `title`, `altText`, `caption`, `description`, and `status`. But it does NOT update the `slug` field, even though:

1. The knowledge doc says slugs should be editable
2. The schema has a `slug` field with a `by_slug` index
3. If a user changes the title, the slug should optionally update to match

**Impact:** Media slugs are frozen at creation time and cannot be updated.

---

### H8. `uploadedBy` Uses `v.id("users")` Instead of Convex Auth ID

**File:** `schema/media.ts`
**Severity:** HIGH (Architecture mismatch)

The schema defines `uploadedBy` as `v.id("users")`:

```typescript
uploadedBy: v.id("users"),
```

However, the knowledge doc specifies `v.string()` for user identifier. The auth helpers in `mediaAuth.ts` use `ctx.auth.getUserIdentity()` which returns a auth identity token. The `create` mutation does a user lookup by `tokenIdentifier` to get the internal user ID.

This works but creates a tight coupling. If the users table changes or the auth flow changes, the media system breaks. The knowledge doc pattern of storing the Convex Auth ID string directly is more resilient.

**Impact:** Not a bug per se, but deviates from the knowledge doc architecture. Could cause issues if user records are deleted but media remains.

---

## MEDIUM Issues

### M1. `type ActionCtx = any` in Actions

**File:** `media/actions.ts`, line ~14
**Severity:** MEDIUM (TypeScript)

```typescript
type ActionCtx = any;
```

This completely disables type checking for all action handler contexts. Every `ctx` parameter in the action handlers loses type safety.

**Fix:** Import the proper type from Convex:
```typescript
import type { ActionCtx } from "../_generated/server";
```

---

### M2. `any` Type Casts in UploadProgress

**File:** `components/media/UploadProgress.tsx`
**Severity:** MEDIUM (TypeScript)

Multiple instances of `item: any` in the component:

```typescript
{recentUploads.map((item: any) => (
```

The items come from a Convex query and should have proper types inferred from the query return type.

**Fix:** Type the items using the query's return type or define an explicit interface.

---

### M3. `any` Type Casts in MediaPicker

**File:** `components/media/MediaPicker.tsx`
**Severity:** MEDIUM (TypeScript)

Similar to M2, uses `any` for media items from queries:

```typescript
{mediaItems.map((item: any) => (
```

**Fix:** Use proper Convex query return types.

---

### M4. Type Assertions in mediaAuth.ts

**File:** `media/mediaAuth.ts`
**Severity:** MEDIUM (TypeScript)

Uses type assertions instead of proper typing:

```typescript
const role = roles.find((r) => r._id === user.roleId);
const level = (role as { level?: number })?.level ?? 0;
```

The `role` object should already have a `level` field if the schema is correct. This assertion suggests either a schema mismatch or missing type import.

**Fix:** Import the proper table type from the schema to avoid unsafe assertions.

---

### M5. DropZone Object URL Memory Leak Potential

**File:** `components/media/DropZone.tsx`
**Severity:** MEDIUM (Resource management)

The DropZone creates object URLs for file thumbnails during upload:

```typescript
const preview = URL.createObjectURL(file);
```

These are stored in state and rendered. While the component does clean up URLs when files are removed from the queue, there is a potential leak if:
- The component unmounts while uploads are in progress
- The user navigates away during upload

There is no `useEffect` cleanup that revokes all active object URLs on unmount.

**Fix:** Add a cleanup effect:
```typescript
useEffect(() => {
  return () => {
    uploadQueue.forEach(item => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
  };
}, []);
```

---

### M6. CropTool Lacks Mouse Drag Interaction

**File:** `components/media/CropTool.tsx`
**Severity:** MEDIUM (UX)

The CropTool provides:
- Numeric input fields for X, Y, Width, Height
- Aspect ratio preset buttons (Free, 1:1, 4:3, 16:9, 3:2)
- A visual overlay with rule-of-thirds grid

But it does NOT support:
- Mouse click-and-drag to define the crop area
- Mouse drag to reposition the crop area
- Mouse drag on edges/corners to resize the crop area

Users must manually type pixel values to define their crop, which is impractical for most use cases.

**Impact:** Poor UX for image cropping. Most users expect visual drag-to-crop.

---

### M7. MediaListTable Uploader Name Only Shows "Me"

**File:** `components/media/MediaListTable.tsx`
**Severity:** MEDIUM (Incomplete feature)

The uploader column only displays "Me" for items uploaded by the current user, and falls back to "Unknown" for all others:

```typescript
const uploaderName = item.uploadedBy === currentUser?._id ? "Me" : "Unknown";
```

The `get` query in `queries.ts` does perform a user lookup and returns `uploaderName`, but the `list` query (used by MediaListTable) does not enrich items with uploader names. This means the list view never shows actual uploader names for other users' uploads.

**Impact:** Admins/editors cannot see who uploaded media in the list view.

---

### M8. Missing `unattached` Count

**File:** `media/queries.ts`
**Severity:** MEDIUM (PRD compliance)

The `counts` query returns: `all`, `image`, `video`, `audio`, `document`, `archive`, `other`, `trash`, `processing`, `failed`.

It does NOT return `unattached` (media not associated with any post/page). This is a WordPress standard filter in the Media Library. This is related to H2 (missing `attachedTo` field) but is also independently a gap in the counts query output.

---

### M9. Bulk Delete Max 100 Items Without Pagination

**File:** `media/mutations.ts`
**Severity:** MEDIUM (UX limitation)

The `bulkDelete` mutation enforces a maximum of 100 items:

```typescript
if (args.mediaIds.length > 100) {
  throw new Error("Cannot bulk delete more than 100 items at once");
}
```

But there is no client-side mechanism for paginated bulk deletion. If a user selects more than 100 items (possible with "select all" in a large library), the operation will fail with no fallback.

**Impact:** Users cannot bulk delete large numbers of media items.

---

### M10. Event Emission Workaround in Actions

**File:** `media/actions.ts`
**Severity:** MEDIUM (Code quality)

Image editing actions (crop, rotate, flip, scale) emit events by calling the `update` mutation with unchanged data:

```typescript
// Trigger event by calling update (which emits media.updated event)
await ctx.runMutation(api.media.mutations.update, {
  id: args.mediaId,
  title: media.title, // Same title - just to trigger the event
});
```

This is a workaround that:
- Creates unnecessary database writes
- Generates misleading audit trail entries (shows as "update" not "crop/rotate/flip/scale")
- Couples action event emission to the mutation's event logic

**Fix:** Use the `emitEvent` helper directly from a dedicated internal mutation, or add specific event types for image editing operations.

---

## LOW Issues

### L1. Missing PRD Document

**Expected path:** `specs/ConvexPress/systems/media/PRD.md`
**Severity:** LOW (Documentation)

The PRD file does not exist at the expected path. The `specs/` directory does not exist under ConvexPress. The knowledge doc (`.claude/docs/MEDIA-SYSTEM.md`) serves as the primary specification, but a formal PRD should exist for consistency with other systems.

---

### L2. `cleanupExpiredMedia` Not Scheduled

**File:** `media/internals.ts`
**Severity:** LOW (Maintenance)

The `cleanupExpiredMedia` internal mutation exists and handles:
- Marking stuck processing items as failed (2h threshold)
- Deleting old failed items (30 days)
- Batch limited to 50 items

But there is no cron job or scheduled function to call it. It exists as dead code unless manually triggered.

**Fix:** Add a Convex cron job to run this daily or hourly.

---

### L3. `generateSlug` Could Produce Empty Slugs

**File:** `media/helpers.ts`
**Severity:** LOW (Edge case)

The `generateSlug` function strips non-alphanumeric characters:

```typescript
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

If the title contains only special characters (e.g., a file named `!@#$.jpg`), the slug would be empty after processing. The `create` mutation does generate a slug from `titleFromFilename`, but if that title is all special chars, an empty slug could be inserted.

---

### L4. ImageEditor Scale Has No Preview

**File:** `components/media/ImageEditor.tsx`
**Severity:** LOW (UX)

The scale operation presents a slider and numeric input for the target width, calculates proportional height, but does not show a visual preview of the scaled result before committing.

---

### L5. MediaImage Fallback Renders Empty on Query Loading

**File:** `ConvexPress-Website/.../MediaImage.tsx`
**Severity:** LOW (UX)

When `srcSet` query is loading (returns `undefined`), the component renders the `ImagePlaceholder`. However, if the query resolves to `null` (media not found), it also renders the placeholder with no indication that the image is missing vs still loading.

---

### L6. No File Size Limit Enforcement on Server

**File:** `media/mutations.ts`
**Severity:** LOW (Validation)

The `create` mutation validates that `fileSize > 0` but does not enforce a maximum file size. The client-side DropZone may enforce limits, but server-side validation should also cap file sizes to prevent abuse.

---

### L7. Hardcoded WordPress Size Definitions

**File:** `media/internals.ts`
**Severity:** LOW (Flexibility)

The WordPress-standard sizes are hardcoded:

```typescript
const WORDPRESS_SIZES = [
  { name: "thumbnail", width: 150, height: 150, crop: true },
  { name: "medium", width: 300, height: 0, crop: false },
  { name: "medium_large", width: 768, height: 0, crop: false },
  { name: "large", width: 1024, height: 0, crop: false },
];
```

The knowledge doc mentions these should eventually be configurable through Settings. Currently there is no way for administrators to add custom sizes or modify the defaults.

---

## React 19 Compatibility

All components were reviewed for React 19 compatibility:

| Pattern | Status |
|---------|--------|
| `useEffect` usage | PASS - No deprecated patterns |
| `ref` handling | PASS - No `forwardRef` (React 19 handles refs natively) |
| `key` prop usage | PASS - Proper keys on mapped elements |
| `use` hook | N/A - Not used but could benefit from it |
| `useFormStatus` / `useActionState` | N/A - Not applicable (uses TanStack Form) |
| `Suspense` boundaries | PASS - No issues |
| String refs | PASS - None found |
| Legacy context API | PASS - None found |
| `defaultProps` on function components | PASS - None found |

**Verdict:** No React 19 compatibility issues found.

---

## Convex Best Practices Review

| Practice | Status | Notes |
|----------|--------|-------|
| Indexes for filtered fields | PASS | 9 indexes on media table cover all query patterns |
| `v.id()` for references | PASS | Uses `v.id("users")`, `v.id("_storage")` |
| Auth checks on mutations | PASS | All public mutations check auth |
| Auth checks on queries | PARTIAL | `getSrcSet` is intentionally public (website rendering) |
| Internal vs public functions | FAIL | `addSize`, `updateStatus` should be internal (see C2) |
| Pagination | PASS | Cursor-based pagination on list query |
| Error handling in mutations | PASS | Proper error messages with context |
| Event emission | PASS | Events emitted on create/update/delete |
| Validator reuse | PASS | Centralized in `validators.ts` |
| Schema modularity | PASS | Schema in `schema/media.ts`, exports `mediaTables` |

---

## Implementation Completeness vs Knowledge Doc

### Backend Functions

| Function (Knowledge Doc) | Status | Notes |
|--------------------------|--------|-------|
| `media.mutations.create` | IMPLEMENTED | Missing `validateFileType` call |
| `media.mutations.update` | IMPLEMENTED | Missing slug update |
| `media.mutations.remove` | IMPLEMENTED | Full cascading delete |
| `media.mutations.bulkDelete` | IMPLEMENTED | Max 100 limit |
| `media.mutations.generateUploadUrl` | IMPLEMENTED | |
| `media.queries.list` | IMPLEMENTED | Missing date/sort filters |
| `media.queries.get` | IMPLEMENTED | Full enrichment |
| `media.queries.getByIds` | IMPLEMENTED | Batch lookup |
| `media.queries.counts` | IMPLEMENTED | Performance issue, missing unattached |
| `media.queries.getUrl` | IMPLEMENTED | |
| `media.queries.getSrcSet` | IMPLEMENTED | |
| `media.actions.crop` | IMPLEMENTED | Metadata-only |
| `media.actions.rotate` | IMPLEMENTED | Metadata-only |
| `media.actions.flip` | IMPLEMENTED | Metadata-only |
| `media.actions.scale` | IMPLEMENTED | Metadata-only |
| `media.actions.revert` | IMPLEMENTED | |
| `media.internals.processImageAction` | IMPLEMENTED | No actual resizing |
| `media.internals.cleanupExpiredMedia` | IMPLEMENTED | Not scheduled |
| HTTP API endpoints | STUB | All 4 endpoints are placeholders |

### Schema Fields

| Field (Knowledge Doc) | Status |
|----------------------|--------|
| `title` | IMPLEMENTED |
| `slug` | IMPLEMENTED |
| `filename` | IMPLEMENTED |
| `mimeType` | IMPLEMENTED |
| `type` | IMPLEMENTED |
| `fileSize` | IMPLEMENTED |
| `storageId` | IMPLEMENTED |
| `width` / `height` | IMPLEMENTED |
| `altText` | IMPLEMENTED |
| `caption` | IMPLEMENTED |
| `description` | IMPLEMENTED |
| `status` | IMPLEMENTED |
| `uploadedBy` | IMPLEMENTED (as v.id, doc says v.string) |
| `attachedTo` | MISSING |

### Admin UI Pages

| Page (Knowledge Doc) | Status | Notes |
|----------------------|--------|-------|
| Media Library (list + grid views) | IMPLEMENTED | |
| Upload Media page | IMPLEMENTED | |
| Edit Media page | IMPLEMENTED | Full-page, not popup |
| Image Editor (crop/rotate/flip/scale/revert) | IMPLEMENTED | No mouse drag on crop |
| EXIF Panel | IMPLEMENTED | GPS key name bug |
| Image Sizes Panel | IMPLEMENTED | |
| Media Picker (inline, not modal) | IMPLEMENTED | Correct non-popup pattern |
| Bulk actions (delete) | IMPLEMENTED | |

### Website UI Components

| Component | Status | Notes |
|-----------|--------|-------|
| MediaImage (responsive, srcset) | IMPLEMENTED | |
| ImagePlaceholder (skeleton) | IMPLEMENTED | |

---

## Recommendations (Priority Order)

### Must Fix (Before Production)

1. **C1** - Call `validateFileType` in the `create` mutation
2. **C2** - Convert `addSize` and `updateStatus` to internal mutations
3. **C3** - Block SVG uploads or implement SVG sanitization
4. **H5** - Fix EXIF GPS key name mismatch (`_exif_gps_lat` -> `_exif_gps_latitude`)

### Should Fix (Important for Feature Completeness)

5. **H1** - Wire up HTTP API endpoints to actual functions
6. **H2** - Add `attachedTo` field to schema
7. **H3** - Optimize `counts` query (avoid loading all records)
8. **H4** - Add missing list filters (date range, sort options)
9. **H7** - Allow slug updates in the `update` mutation
10. **M1** - Fix `type ActionCtx = any` with proper Convex type

### Nice to Have (Quality Improvements)

11. **M2/M3** - Remove `any` types in UploadProgress and MediaPicker
12. **M5** - Add object URL cleanup on DropZone unmount
13. **M6** - Add mouse drag interaction to CropTool
14. **M7** - Enrich list query with uploader names
15. **M10** - Use dedicated event types for image edit operations
16. **L2** - Schedule `cleanupExpiredMedia` with a cron job
17. **L6** - Add server-side max file size validation

---

## Overall Assessment

The Media System is **substantially implemented** with good architecture. The modular schema pattern, WordPress-modeled UI, and Convex conventions are followed correctly. The system handles file uploads, metadata management, image editing (metadata-based), EXIF extraction, responsive image delivery, and bulk operations.

**Strengths:**
- Clean separation of concerns (schema, queries, mutations, actions, internals, helpers, auth, validators)
- Pure JS EXIF parsing avoids native dependency issues in Convex runtime
- WordPress-standard image sizes and naming conventions
- Proper auth gating with role-level checks
- Full-page editing (no popups for content management)
- MediaPicker uses inline panel pattern (not modal)
- Good event emission on CRUD operations
- Cursor-based pagination for list queries

**Primary Concerns:**
- Three critical security gaps (file type validation not called, public system mutations, no SVG sanitization)
- HTTP API is entirely non-functional (all stubs)
- Image sizes are cosmetic only (no actual resizing due to Convex runtime limitation)
- Several TypeScript `any` escapes that undermine type safety
- EXIF GPS display is broken due to key name mismatch

**Estimated PRD Compliance: ~70%**
Core upload/manage/edit flows work. Major gaps are HTTP API, attachment tracking, advanced filtering, and the security issues above.
