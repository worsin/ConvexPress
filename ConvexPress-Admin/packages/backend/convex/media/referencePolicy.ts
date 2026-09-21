/** Authored containers requiring conservative exact-ID inspection. Not a block registry.
 * Strings containing an ID are in-use even when their encoding cannot be safely cleared.
 * External URLs, encrypted payloads and arbitrary third-party encodings are not decoded.
 */
import { opaqueMediaReferences } from "./referenceInventory.generated";
export const opaqueMediaContainers: Readonly<Record<string, readonly string[]>> = opaqueMediaReferences;
// Only reviewed clearing semantics. New typed references are detected automatically,
// but force remains refused until their field invariants have an explicit adapter.
export const clearableMediaFields: Readonly<Record<string, readonly string[]>> = {
  users: ["avatarMediaId"], posts: ["featuredImageId", "hero.imageId", "topics.*.imageId"],
  commerce_products: ["featuredMediaId", "galleryMediaIds.*"],
  commerce_product_variants: ["featuredMediaId", "galleryMediaIds.*"],
  commerce_product_categories: ["thumbnailMediaId"], gallery_albums: ["coverMediaId"],
  gallery_albumItems: ["mediaId"], kb_articles: ["featuredImageId"], kb_collections: ["coverImageId"],
  recipes: ["featuredImageId", "scanMediaId"], lms_courses: ["featuredImageId"],
  lms_nodes: ["videoMediaId", "audioMediaId", "captionsMediaId", "aiVideoMediaId"],
  lms_certificates: ["backgroundMediaId"],
};
export const MEDIA_REFERENCE_PAGE = Object.freeze({ cursor: null, numItems: 256, maximumRowsRead: 256, maximumBytesRead: 512 * 1024 });
export const MEDIA_REFERENCE_TOTAL = Object.freeze({ rows: 2000, bytes: 4 * 1024 * 1024, documents: 100, queries: 160 });
