# Media Center Integration Fix Guide

Date: 2026-04-11

Audience: Claude or any implementation agent fixing the media-center integration gaps found in the ConvexPress audit.

## Goal

Bring ConvexPress closer to the WordPress + WooCommerce media model:

- The media center is the central source of truth for uploaded files.
- Product, variant, category, post, page, custom-field, and imported content imagery should reference media records where practical.
- Storefront rendering should use the shared responsive media rendering path instead of scattering raw URL `<img>` usage.
- WordPress/WooCommerce import should produce local media records, preserve source mappings, and rewrite imported references into usable ConvexPress media references.

Do not delete or rewrite `.claude/` assets. Keep changes in the live app code and Codex-side docs only.

## Context To Load First

Read these before making changes:

- `AGENTS.md`
- `.codex/agents/experts/media-system.md`
- `.codex/docs/MEDIA-SYSTEM.md`
- `.codex/docs/COMMERCE-CORE-PLUGIN-PRD.md`
- `.codex/docs/COMMERCE-WOOSYNC-PLUGIN-PRD.md`
- `.codex/docs/WORDPRESS-WOOCOMMERCE-SYNC-PRODUCTION-STRATEGY.md`

The codebase is currently dirty. Do not revert unrelated edits.

## Current Assessment

The backend media center exists and is partially integrated:

- Product schema already supports product featured media and gallery media.
- Variant schema already supports variant featured media.
- Storefront products, cart, wishlist, recipes, and galleries use `MediaImage` in several places.
- WordPress media import creates local `media` records.
- WooCommerce catalog import maps product image IDs to `featuredMediaId` and `galleryMediaIds`.

The implementation is not yet at WooCommerce/WordPress parity because important admin authoring, rendering, and import-rewrite paths still bypass or only partially use the media center.

## Fix Order

Do these in this order:

1. Fix quick type/API mismatches blocking media work.
2. Add product media authoring in the admin product editor.
3. Add variant media authoring and make cart lines variant-aware.
4. Add product category thumbnails.
5. Unify public post/page featured image rendering through `MediaImage`.
6. Decide and implement a stable block image/gallery media-reference model.
7. Wire custom field image/file/gallery fields to the media picker.
8. Complete WordPress/WooCommerce media URL rewrite behavior.
9. Run focused type checks and targeted smoke tests.

## 1. Fix Immediate Type/API Mismatches

### 1.1 Admin commerce category table name typo

Problem:

`CommerceProductEditor.tsx` refers to `Id<"commerce_categories">`, but the real schema table is `commerce_product_categories`.

Files:

- `ConvexPress-Admin/apps/web/src/components/commerce/CommerceProductEditor.tsx`
- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`

Fix:

- Replace `Id<"commerce_categories">` with `Id<"commerce_product_categories">`.
- Update `Category` and `selectedCategoryIds` types.
- Keep mutation payloads aligned with `commerce/products` validators.

Acceptance:

- The admin app no longer reports `commerce_categories` type errors.

### 1.2 `MediaImage` needs either `fetchPriority` support or callers must stop passing it

Problem:

Product detail passes `fetchPriority="high"` to `MediaImage`, but `MediaImageProps` does not accept that prop.

Files:

- `ConvexPress-Website/apps/web/src/components/media/MediaImage.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/products/$slug.tsx`
- Also search for `fetchPriority` in website routes.

Preferred fix:

- Add optional `fetchPriority?: "high" | "low" | "auto"` to `MediaImageProps`.
- Pass it through to `<img fetchPriority={fetchPriority}>`.

Acceptance:

- Product detail can keep eager/high-priority hero product image behavior.
- Website type check no longer reports the `fetchPriority` prop error.

### 1.3 Older editor media picker passes wrong filename key

Problem:

`components/editor/MediaPicker.tsx` calls `createMedia` with `filename`, but media creation expects `fileName`.

Files:

- `ConvexPress-Admin/apps/web/src/components/editor/MediaPicker.tsx`
- `ConvexPress-Admin/packages/backend/convex/media/validators.ts`

Fix:

- Change `filename: file.name` to `fileName: file.name`.
- Compare this component with `components/media/MediaPicker.tsx`. If the older editor picker is redundant, migrate consumers to the newer shared media picker instead of maintaining two implementations.

Acceptance:

- Upload through post/page featured image and structured content picker works.
- No `filename` media-create payload remains.

## 2. Add Product Media Authoring In Admin

Problem:

Backend product records support `featuredMediaId` and `galleryMediaIds`, but `CommerceProductEditor` has no UI, state, preview, or save payload for product media.

Files:

- `ConvexPress-Admin/apps/web/src/components/commerce/CommerceProductEditor.tsx`
- `ConvexPress-Admin/apps/web/src/components/media/MediaPicker.tsx`
- `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/validators.ts`

Implementation:

- Import the shared `MediaPicker` from `@/components/media/MediaPicker`.
- Add product state:
  - `featuredMediaId?: Id<"media">`
  - `galleryMediaIds: Id<"media">[]`
- On edit load, initialize from `product.featuredMediaId` and `product.galleryMediaIds`.
- Add a product media section in the editor UI:
  - Featured product image picker.
  - Gallery image picker with add/remove/reorder if the local UI pattern supports it.
  - Preview selected media items.
- Include `featuredMediaId` and `galleryMediaIds` in create/update payloads.
- Ensure clearing the featured image is supported. If the update validator does not currently allow null/clear for `featuredMediaId`, update the validator and mutation patch behavior intentionally.

Acceptance:

- New product can be created with featured image and gallery images.
- Existing product can set, replace, remove featured image.
- Existing product can add/remove gallery images.
- Storefront product list and detail render the selected product image through `MediaImage`.
- No hardcoded external image URL field is introduced.

## 3. Add Variant Media Authoring And Variant-Aware Cart Images

Problem:

Variant records support `featuredMediaId`, and product detail already tries to prefer the selected variant image. The admin editor does not expose variant image selection, and cart lines only render product image.

Files:

- `ConvexPress-Admin/apps/web/src/components/commerce/CommerceProductEditor.tsx`
- `ConvexPress-Admin/packages/backend/convex/commerce/products.ts`
- `ConvexPress-Website/apps/web/src/routes/_marketing/products/$slug.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/cart.tsx`
- `ConvexPress-Admin/packages/backend/convex/commerce/cart.ts`

Implementation:

- Add `featuredMediaId` to the admin `Variant` type.
- Add state/draft support for variant image IDs.
- In the variant edit UI, add a media picker for each variant or a compact “Variant image” control.
- Include `featuredMediaId` in `createVariant` and `updateVariant` payloads.
- Update cart UI image selection:
  - Prefer `item.variant?.featuredMediaId`.
  - Fallback to `item.product?.featuredMediaId`.
- Ensure cart query returns the variant object, which it already does.

Acceptance:

- Variant image can be assigned in admin.
- Product detail swaps image when a selected variant has a media image.
- Cart line shows selected variant image when present.

## 4. Add Product Category Thumbnails

Problem:

WooCommerce product categories support thumbnails. ConvexPress commerce categories currently do not.

Files:

- `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/validators.ts`
- `ConvexPress-Admin/packages/backend/convex/commerce/categories.ts`
- `ConvexPress-Admin/apps/web/src/components/commerce/CommerceCategoryManager.tsx`
- Storefront category/archive routes if present.
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/commerceCatalog.ts`

Implementation:

- Add `thumbnailMediaId: v.optional(v.id("media"))` to `commerce_product_categories`.
- Update create/update category validators.
- Update create/update mutations to save and clear the thumbnail media ID.
- Add a media picker to `CommerceCategoryManager`.
- Update public category list/archive data to return thumbnail media ID if needed.
- In WooCommerce import, map category image IDs to `thumbnailMediaId` when Woo category images are available.

Acceptance:

- Admin can set/clear product category thumbnail through media center.
- Storefront category surfaces can render thumbnails via `MediaImage`.
- WooCommerce imported category thumbnails are mapped when available.

## 5. Use `MediaImage` For Public Post/Page Featured Images

Problem:

Public blog/page components render raw URLs with `<img>`. This works but bypasses the responsive media component and srcset behavior.

Files:

- `ConvexPress-Website/apps/web/src/components/blog/PostHeader.tsx`
- `ConvexPress-Website/apps/web/src/components/blog/PostCard.tsx`
- `ConvexPress-Website/apps/web/src/components/blog/PostCardFeatured.tsx`
- `ConvexPress-Website/apps/web/src/components/blog/PageContent.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/blog/index.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/blog/$slug.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/category/$slug.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/tag/$slug.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/author/$slug.tsx`
- `ConvexPress-Admin/packages/backend/convex/posts/queries.ts`
- `ConvexPress-Admin/packages/backend/convex/pages/queries.ts`

Preferred model:

- Backend public post/page queries should return `featuredImageId` as well as URL/alt, or the UI should already receive it from the post document.
- Website components should render `MediaImage` when `featuredImageId` exists.
- Fallback to raw `featuredImageUrl` only for legacy/imported content that does not have a local media ID.

Acceptance:

- Blog index cards use `MediaImage` when media ID exists.
- Blog detail featured image uses `MediaImage`.
- Page detail featured image uses `MediaImage`.
- Existing legacy URL-only content still renders.

## 6. Normalize Block Image And Gallery Media References

Problem:

Classic block rendering uses `block.attrs.src` directly for image/gallery blocks. That bypasses media IDs and makes import rewriting awkward.

Files:

- `ConvexPress-Website/apps/web/src/components/blog/BlockContentRenderer.tsx`
- `ConvexPress-Website/apps/web/src/lib/blog/types.ts`
- TipTap/editor image and gallery insertion code under `ConvexPress-Admin/apps/web/src/components/editor/`
- WordPress sync post/page import and reconciliation phases.

Implementation options:

- Preferred: extend image block attrs with `mediaId?: string`, keeping `src?: string` as a legacy fallback.
- For gallery items, store `mediaId` per image item where possible.
- Update renderer:
  - If `mediaId` exists, use `MediaImage`.
  - Else render legacy URL.
- Update editor insertion flows to store media ID when selecting from media center.
- Update import URL rewrite to convert known source URLs into `mediaId` attrs when content is valid JSON block content.
- For raw HTML content, either rewrite to final local media URLs or preserve a clear legacy path. Do not leave unresolved `{{media:id}}` placeholders in rendered content unless a renderer explicitly resolves them.

Acceptance:

- New editor-inserted images are media-ID-backed.
- Existing URL-only blocks still render.
- Imported known media URLs are rewritten into usable media references.

## 7. Wire Custom Field Media Types

Problem:

Custom field `image`, `file`, and `gallery` field components have placeholder button handlers.

Files:

- `ConvexPress-Admin/apps/web/src/components/custom-fields/fields/FieldImage.tsx`
- `ConvexPress-Admin/apps/web/src/components/custom-fields/fields/FieldFile.tsx`
- `ConvexPress-Admin/apps/web/src/components/custom-fields/fields/FieldGallery.tsx`
- `ConvexPress-Admin/apps/web/src/components/media/MediaPicker.tsx`

Implementation:

- Use `MediaPicker` for image fields with `allowedTypes={["image"]}`.
- Use `MediaPicker` for file fields. Decide allowed types from custom-field settings if available; otherwise allow documents/images/audio/video as appropriate.
- Use repeated `MediaPicker` selection for gallery fields, storing an array of media IDs.
- Show human-friendly selected media title/preview when possible, not just the raw ID string.

Acceptance:

- Image custom fields can select/clear media-center images.
- File custom fields can select/clear media-center files.
- Gallery custom fields can add/remove media-center images.
- No placeholder `/* Media picker integration */` comments remain.

## 8. Complete WordPress/WooCommerce Media Rewrite

Problem:

Media import creates local media records and Woo products get media IDs, but reconciliation URL rewriting is incomplete:

- It only fetches `objectType: "post"` mappings.
- It returns without processing pages.
- It replaces URLs with `{{media:id}}` placeholders.
- It does not fully address Elementor, ACF, Yoast, product category thumbnails, variation images, or product gallery URLs beyond direct Woo image ID mapping.

Files:

- `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/media.ts`
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/posts.ts`
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/pages.ts`
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/reconciliation.ts`
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/phases/commerceCatalog.ts`
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/elementor.ts`
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/acfParser.ts`
- `ConvexPress-Admin/packages/backend/convex/wordpressSync/helpers/yoastParser.ts`
- `ConvexPress-Admin/packages/backend/convex/schema/wordpressSync.ts`

Implementation:

- Build a reliable media URL mapping registry from `wpIdMappings` and `media.wpSourceUrl`.
- Include all WordPress size URLs, not just the original source URL, where possible.
- Reconcile both posts and pages.
- For JSON block content:
  - Replace image/gallery attrs with local `mediaId` when source URL matches.
  - Keep URL fallback if no mapping exists and emit a finding.
- For raw HTML content:
  - Prefer replacing source URLs with local resolved `media.url`.
  - Avoid `{{media:id}}` unless a rendering pass resolves it.
- Run Elementor/ACF/Yoast remapping helpers where the data exists.
- Extend Woo category import to map thumbnail images once category thumbnail schema exists.
- Preserve idempotency:
  - Re-running rewrite should not duplicate or corrupt content.
  - Already rewritten media references should be skipped.
  - Unmapped URLs should produce findings, not silent success.

Acceptance:

- Imported post content does not retain avoidable source WordPress media URLs.
- Imported page content does not retain avoidable source WordPress media URLs.
- Product images/galleries use local media IDs.
- Category thumbnails use local media IDs when implemented.
- Reconciliation report shows unresolved media URL findings.

## 9. Verification

Run targeted checks after each slice:

- Admin web type check: `cd ConvexPress-Admin/apps/web && bun run check-types`
- Website web type check: `cd ConvexPress-Website/apps/web && bun run check-types`
- Search for placeholders:
  - `rg "Media picker integration|Media picker for gallery|filename:" ConvexPress-Admin/apps/web/src`
  - `rg "\\{\\{media:" ConvexPress-Admin/packages/backend/convex ConvexPress-Website/apps/web/src`
- Search for raw image rendering in media-backed components:
  - `rg "<img|featuredImageUrl|block.attrs.src" ConvexPress-Website/apps/web/src/components ConvexPress-Website/apps/web/src/routes`

Expected current baseline:

- Both apps currently have many unrelated type errors. Do not claim the whole repo is clean unless all are fixed.
- At minimum, remove the media/commerce-specific type errors introduced by the fixes.

Manual smoke tests:

- Upload an image in Media Library.
- Create a product and set featured image + gallery.
- Create a variable product, set variant image, select variant on storefront, confirm image changes.
- Add variant to cart, confirm cart line shows variant image.
- Set product category thumbnail and confirm category/archive display where implemented.
- Create/edit post and page featured image, confirm public render still works.
- Insert image/gallery block from media center, confirm public render uses local media.
- Run a small WordPress/WooCommerce import and inspect rewritten media references.

## Definition Of Done

- Product, variant, and category media can be authored from the admin media center.
- Storefront product, cart, wishlist, post, and page image rendering uses `MediaImage` where media IDs exist.
- Legacy URL-only content still renders safely.
- Custom fields no longer have media picker stubs.
- WordPress/WooCommerce import produces local media records and rewrites media references into usable local media references.
- Targeted media/commerce type errors are fixed.
- No unrelated user changes are reverted.
