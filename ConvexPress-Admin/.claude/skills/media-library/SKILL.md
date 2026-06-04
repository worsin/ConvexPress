---
name: media-library
description: Use when the user asks to upload, organize, debug, audit, or improve ConvexPress media library assets, image/video/audio/document metadata, selectors, block media fields, LMS lesson media, forms file uploads, API media endpoints, or public media rendering.
---

# media-library

Use this for media library work across Admin, backend storage, public renderers,
blocks, Forms uploads, and LMS lesson/certificate assets.

## System Map

- Admin routes: `apps/web/src/routes/_authenticated/_admin/media/**`
- Backend media: `packages/backend/convex/media/`
- HTTP API: `packages/backend/convex/http/media.ts`
- Schema: `packages/backend/convex/schema/media.ts` or related schema imports
- Settings: `apps/web/src/routes/_authenticated/_admin/settings/media.tsx`
- Consumers:
  - block editors/renderers
  - LMS lesson media fields
  - certificate PDF attachment flow
  - Forms file-upload fields
  - product/gallery/post/page featured media

## Workflow

1. Identify asset type: image, video, audio, document, archive, or other.
2. Trace from UI picker/upload -> Convex storage -> media row -> consumer field
   -> public rendering.
3. Preserve metadata: alt text, caption, mime type, dimensions/duration/size,
   storage id, public URL, ownership, and deletion safety.
4. For selector work, keep keyboard accessibility, filtering, upload completion,
   and empty/error states.
5. Do not break saved block/page/product/LMS references when changing media row
   shape.
6. For public rendering, verify fallback images and responsive constraints.

## Verification

Run backend typecheck and any focused media tests. For UI work, smoke upload,
select, replace, and render in the consumer that triggered the task.

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

## Report

List asset types affected, storage/schema implications, consumers checked,
cleanup/deletion behavior, and verification.
