/**
 * Media Reference Tracking
 *
 * Every system that stores a media ID is listed here. Used to:
 *   1. Block deletion of media that is still referenced (default, safe).
 *   2. Sweep all references when force-deleting media (force: true).
 *   3. Report references to admin UI for "where is this used?" views.
 *
 * When a new system adds a media reference field to its schema, you MUST add
 * it to this file. If you skip this step, deleting media will leave dangling
 * references. The media delete mutation enforces this by default.
 */

import type { Id } from "../_generated/dataModel";

export type MediaReference = {
  /** The table the reference lives in. */
  table: string;
  /** The document ID in that table. */
  documentId: string;
  /** The field name on the document. */
  field: string;
  /** Human-readable label for the referencing document (admin UI). */
  label?: string;
  /** When the reference lives inside an array, the index. */
  arrayIndex?: number;
  /** When the reference lives inside a nested object, the path. */
  path?: string;
};

/**
 * Find every document that references the given media ID.
 *
 * Scans across all known reference tables. Returns a flat list of reference
 * records, each tagged with table/field/documentId so callers can either
 * display them or sweep them.
 */
export async function findMediaReferences(
  ctx: any,
  mediaId: Id<"media">,
): Promise<MediaReference[]> {
  const refs: MediaReference[] = [];

  // ── users.avatarMediaId ──────────────────────────────────────────────────
  {
    const rows = await ctx.db
      .query("users")
      .filter((q: any) => q.eq(q.field("avatarMediaId"), mediaId))
      .collect();
    for (const row of rows) {
      refs.push({
        table: "users",
        documentId: row._id,
        field: "avatarMediaId",
        label: row.displayName || row.email || undefined,
      });
    }
  }

  // ── posts (covers posts AND pages — same table) ─────────────────────────
  // featuredImageId, hero.imageId, topics[].imageId
  {
    const rows = await ctx.db.query("posts").collect();
    for (const row of rows) {
      if (row.featuredImageId === mediaId) {
        refs.push({
          table: "posts",
          documentId: row._id,
          field: "featuredImageId",
          label: row.title,
        });
      }
      if (row.hero?.imageId === mediaId) {
        refs.push({
          table: "posts",
          documentId: row._id,
          field: "hero.imageId",
          path: "hero.imageId",
          label: row.title,
        });
      }
      if (Array.isArray(row.topics)) {
        row.topics.forEach((topic: any, index: number) => {
          if (topic?.imageId === mediaId) {
            refs.push({
              table: "posts",
              documentId: row._id,
              field: `topics[${index}].imageId`,
              path: `topics.${index}.imageId`,
              arrayIndex: index,
              label: row.title,
            });
          }
        });
      }
    }
  }

  // ── commerce_products.featuredMediaId and galleryMediaIds ───────────────
  {
    const rows = await ctx.db.query("commerce_products").collect();
    for (const row of rows) {
      if (row.featuredMediaId === mediaId) {
        refs.push({
          table: "commerce_products",
          documentId: row._id,
          field: "featuredMediaId",
          label: row.title,
        });
      }
      if (Array.isArray(row.galleryMediaIds)) {
        row.galleryMediaIds.forEach((gid: any, index: number) => {
          if (gid === mediaId) {
            refs.push({
              table: "commerce_products",
              documentId: row._id,
              field: "galleryMediaIds",
              arrayIndex: index,
              label: row.title,
            });
          }
        });
      }
    }
  }

  // ── commerce_product_variants.featuredMediaId ───────────────────────────
  {
    const rows = await ctx.db
      .query("commerce_product_variants")
      .filter((q: any) => q.eq(q.field("featuredMediaId"), mediaId))
      .collect();
    for (const row of rows) {
      refs.push({
        table: "commerce_product_variants",
        documentId: row._id,
        field: "featuredMediaId",
        label: row.title ?? row.sku ?? row._id,
      });
    }
  }

  // ── commerce_product_categories.thumbnailMediaId ────────────────────────
  {
    const rows = await ctx.db
      .query("commerce_product_categories")
      .filter((q: any) => q.eq(q.field("thumbnailMediaId"), mediaId))
      .collect();
    for (const row of rows) {
      refs.push({
        table: "commerce_product_categories",
        documentId: row._id,
        field: "thumbnailMediaId",
        label: row.name,
      });
    }
  }

  // ── gallery_albums.coverMediaId ─────────────────────────────────────────
  {
    const rows = await ctx.db
      .query("gallery_albums")
      .filter((q: any) => q.eq(q.field("coverMediaId"), mediaId))
      .collect();
    for (const row of rows) {
      refs.push({
        table: "gallery_albums",
        documentId: row._id,
        field: "coverMediaId",
        label: row.title,
      });
    }
  }

  // ── gallery_albumItems.mediaId (indexed) ────────────────────────────────
  {
    const rows = await ctx.db
      .query("gallery_albumItems")
      .withIndex("by_media", (q: any) => q.eq("mediaId", mediaId))
      .collect();
    for (const row of rows) {
      refs.push({
        table: "gallery_albumItems",
        documentId: row._id,
        field: "mediaId",
        label: row.caption || `Album item ${row._id}`,
      });
    }
  }

  // ── kb_articles.featuredImageId ─────────────────────────────────────────
  {
    const rows = await ctx.db
      .query("kb_articles")
      .filter((q: any) => q.eq(q.field("featuredImageId"), mediaId))
      .collect();
    for (const row of rows) {
      refs.push({
        table: "kb_articles",
        documentId: row._id,
        field: "featuredImageId",
        label: row.title,
      });
    }
  }

  // ── kb_collections.coverImageId ─────────────────────────────────────────
  {
    const rows = await ctx.db
      .query("kb_collections")
      .filter((q: any) => q.eq(q.field("coverImageId"), mediaId))
      .collect();
    for (const row of rows) {
      refs.push({
        table: "kb_collections",
        documentId: row._id,
        field: "coverImageId",
        label: row.name,
      });
    }
  }

  // ── recipes.featuredImageId and scanMediaId ─────────────────────────────
  {
    const rows = await ctx.db.query("recipes").collect();
    for (const row of rows) {
      if (row.featuredImageId === mediaId) {
        refs.push({
          table: "recipes",
          documentId: row._id,
          field: "featuredImageId",
          label: row.title,
        });
      }
      if (row.scanMediaId === mediaId) {
        refs.push({
          table: "recipes",
          documentId: row._id,
          field: "scanMediaId",
          label: row.title,
        });
      }
    }
  }

  return refs;
}

/**
 * Clear all references to a media ID across every known table.
 *
 * This is what `remove({ force: true })` runs before deleting the media
 * record. Each reference type has its own patch logic:
 *   - Scalar fields: set to undefined.
 *   - Array fields (galleryMediaIds): filter out the ID.
 *   - Nested object fields (posts.hero.imageId, posts.topics[].imageId):
 *     rebuild the object with the field set to undefined.
 *   - gallery_albumItems: delete the row entirely (the row's reason for
 *     existing is the media reference).
 */
export async function clearMediaReferences(
  ctx: any,
  mediaId: Id<"media">,
  refs: MediaReference[],
): Promise<void> {
  const now = Date.now();

  for (const ref of refs) {
    // Scalar single-field clears
    if (
      (ref.table === "users" && ref.field === "avatarMediaId") ||
      (ref.table === "posts" && ref.field === "featuredImageId") ||
      (ref.table === "commerce_products" && ref.field === "featuredMediaId") ||
      (ref.table === "commerce_product_variants" &&
        ref.field === "featuredMediaId") ||
      (ref.table === "commerce_product_categories" &&
        ref.field === "thumbnailMediaId") ||
      (ref.table === "gallery_albums" && ref.field === "coverMediaId") ||
      (ref.table === "kb_articles" && ref.field === "featuredImageId") ||
      (ref.table === "kb_collections" && ref.field === "coverImageId") ||
      (ref.table === "recipes" &&
        (ref.field === "featuredImageId" || ref.field === "scanMediaId"))
    ) {
      const patch: Record<string, unknown> = {
        [ref.field]: undefined,
      };
      // Most tables have updatedAt; patch it when present.
      const existing = await ctx.db.get(ref.documentId as any);
      if (existing && "updatedAt" in existing) {
        patch.updatedAt = now;
      }
      await ctx.db.patch(ref.documentId as any, patch);
      continue;
    }

    // Array field: commerce_products.galleryMediaIds
    if (
      ref.table === "commerce_products" &&
      ref.field === "galleryMediaIds"
    ) {
      const product = await ctx.db.get(ref.documentId as any);
      if (!product) continue;
      const next = (product.galleryMediaIds ?? []).filter(
        (id: any) => id !== mediaId,
      );
      await ctx.db.patch(ref.documentId as any, {
        galleryMediaIds: next,
        updatedAt: now,
      });
      continue;
    }

    // Nested: posts.hero.imageId
    if (ref.table === "posts" && ref.field === "hero.imageId") {
      const post = await ctx.db.get(ref.documentId as any);
      if (!post?.hero) continue;
      await ctx.db.patch(ref.documentId as any, {
        hero: { ...post.hero, imageId: undefined },
        updatedAt: now,
      });
      continue;
    }

    // Nested: posts.topics[N].imageId
    if (
      ref.table === "posts" &&
      ref.field.startsWith("topics[") &&
      typeof ref.arrayIndex === "number"
    ) {
      const post = await ctx.db.get(ref.documentId as any);
      if (!Array.isArray(post?.topics)) continue;
      const nextTopics = post.topics.map((topic: any, i: number) =>
        i === ref.arrayIndex ? { ...topic, imageId: undefined } : topic,
      );
      await ctx.db.patch(ref.documentId as any, {
        topics: nextTopics,
        updatedAt: now,
      });
      continue;
    }

    // gallery_albumItems: delete the row (its only purpose is the media ref)
    // and decrement the parent album's denormalized itemCount.
    if (ref.table === "gallery_albumItems" && ref.field === "mediaId") {
      const item = await ctx.db.get(ref.documentId as any);
      await ctx.db.delete(ref.documentId as any);
      if (item?.albumId) {
        const album = await ctx.db.get(item.albumId);
        if (album) {
          const nextCount = Math.max(0, (album.itemCount ?? 1) - 1);
          await ctx.db.patch(item.albumId, {
            itemCount: nextCount,
            updatedAt: now,
          });
        }
      }
      continue;
    }
  }
}
