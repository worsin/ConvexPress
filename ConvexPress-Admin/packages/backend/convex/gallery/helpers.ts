import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences, requireAttachableMedia } from "../media/attachmentGuard";

type ReadCtx = Pick<QueryCtx, "db">;
type WriteCtx = Pick<MutationCtx, "db">;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function getRoleLevel(ctx: ReadCtx, roleId: Id<"roles"> | undefined) {
  if (!roleId) return 0;
  const role = await ctx.db.get("roles", roleId);
  return role?.level ?? 0;
}

export async function isGalleryEnabled(ctx: ReadCtx) {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "plugins"))
    .unique();
  const values: unknown = doc?.values;
  return !(
    typeof values === "object" &&
    values !== null &&
    "galleryEnabled" in values &&
    values.galleryEnabled === false
  );
}

export async function getUniqueAlbumSlug(
  ctx: ReadCtx,
  seed: string,
  excludeId?: Id<"gallery_albums">,
) {
  const base = slugify(seed) || "album";
  let slug = base;
  let counter = 2;

  while (true) {
    const existing = await ctx.db
      .query("gallery_albums")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!existing || existing._id === excludeId) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function getUniqueCategorySlug(
  ctx: ReadCtx,
  seed: string,
  excludeId?: Id<"gallery_categories">,
) {
  const base = slugify(seed) || "gallery-category";
  let slug = base;
  let counter = 2;

  while (true) {
    const existing = await ctx.db
      .query("gallery_categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!existing || existing._id === excludeId) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function requireImageMedia(ctx: ReadCtx, mediaId: Id<"media"> | undefined) {
  if (!mediaId) return null;
  const media = await requireAttachableMedia(ctx, mediaId);
  if (!media || media.mediaType !== "image") {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Gallery items must reference image media.",
    });
  }
  return media;
}

export interface GalleryCategorySummary {
  _id: Id<"gallery_categories">;
  name: string;
  slug: string;
  description?: string;
  albumCount: number;
}

export async function enrichCategories(
  ctx: ReadCtx,
  categoryIds: readonly Id<"gallery_categories">[],
): Promise<GalleryCategorySummary[]> {
  const categories = await Promise.all(
    categoryIds.map(async (categoryId): Promise<GalleryCategorySummary | null> => {
      const category = await ctx.db.get("gallery_categories", categoryId);
      if (!category) return null;
      return {
        _id: category._id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        albumCount: category.albumCount,
      };
    }),
  );
  return categories.filter((category): category is GalleryCategorySummary => category !== null);
}

export type GalleryMediaSummary = Pick<Doc<"media">, "_id" | "title" | "url" | "altText" | "caption" | "width" | "height" | "mimeType">;

export async function enrichMedia(ctx: ReadCtx, mediaId: Id<"media">): Promise<GalleryMediaSummary | null> {
  const media = await ctx.db.get("media", mediaId);
  if (!media) return null;
  // Gallery albums are public-facing. Only expose active media so
  // validating/failed uploads don't leak into the public surface.
  if (media.status !== "active") return null;

  return {
    _id: media._id,
    title: media.title,
    url: media.url,
    altText: media.altText,
    caption: media.caption,
    width: media.width,
    height: media.height,
    mimeType: media.mimeType,
  };
}

export interface GalleryAlbumItemSummary {
  _id: Id<"gallery_albumItems">;
  mediaId: Id<"media">;
  sortOrder: number;
  caption?: string;
  altText?: string;
  linkUrl?: string;
  media: GalleryMediaSummary;
}

export async function listAlbumItems(
  ctx: ReadCtx,
  albumId: Id<"gallery_albums">,
): Promise<GalleryAlbumItemSummary[]> {
  const items = await ctx.db
    .query("gallery_albumItems")
    .withIndex("by_album_sort", (q) => q.eq("albumId", albumId))
    .collect();

  const enriched = await Promise.all(
    items
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(async (item): Promise<GalleryAlbumItemSummary | null> => {
        const media = await enrichMedia(ctx, item.mediaId);
        if (!media) return null;

        return {
          _id: item._id,
          mediaId: item.mediaId,
          sortOrder: item.sortOrder,
          caption: item.caption ?? media.caption,
          altText: item.altText ?? media.altText,
          linkUrl: item.linkUrl,
          media,
        };
      }),
  );
  return enriched.filter((item): item is GalleryAlbumItemSummary => item !== null);
}

export type EnrichedGalleryAlbum = Doc<"gallery_albums"> & {
  categories: GalleryCategorySummary[];
  items: GalleryAlbumItemSummary[];
  coverMedia: GalleryMediaSummary | null;
};

export async function enrichAlbum(ctx: ReadCtx, album: Doc<"gallery_albums">): Promise<EnrichedGalleryAlbum> {
  const categories = await enrichCategories(ctx, album.categoryIds);
  const items = await listAlbumItems(ctx, album._id);
  const coverMedia =
    (album.coverMediaId && (await enrichMedia(ctx, album.coverMediaId))) ||
    (items[0]?.media ?? null);

  return {
    ...album,
    categories,
    items,
    coverMedia,
  };
}

export async function recomputeCategoryCounts(
  ctx: WriteCtx,
  categoryIds: readonly Id<"gallery_categories">[],
) {
  if (categoryIds.length === 0) return;

  const albums = await ctx.db.query("gallery_albums").take(5000);
  for (const categoryId of categoryIds) {
    const count = albums.filter(
      (album) =>
        album.status === "publish" &&
        album.categoryIds.some((entry) => entry === categoryId),
    ).length;

    await ctx.db.patch("gallery_categories", categoryId, {
      albumCount: count,
      updatedAt: Date.now(),
    });
  }
}

export async function replaceAlbumItems(
  ctx: WriteCtx,
  albumId: Id<"gallery_albums">,
  items: Array<{
    mediaId: Id<"media">;
    caption?: string;
    altText?: string;
    linkUrl?: string;
  }>,
) {
  const existing = await ctx.db
    .query("gallery_albumItems")
    .withIndex("by_album", (q) => q.eq("albumId", albumId))
    .collect();

  await Promise.all(existing.map((item) => deleteWithMediaReferences<"gallery_albumItems">(ctx, "gallery_albumItems", item._id)));

  const now = Date.now();
  for (const [index, item] of items.entries()) {
    await requireImageMedia(ctx, item.mediaId);
    await insertWithMediaReferences<"gallery_albumItems">(ctx, "gallery_albumItems", {
      albumId,
      mediaId: item.mediaId,
      sortOrder: index,
      caption: item.caption?.trim() || undefined,
      altText: item.altText?.trim() || undefined,
      linkUrl: item.linkUrl?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  await patchWithMediaReferences<"gallery_albums">(ctx, "gallery_albums", albumId, {
    itemCount: items.length,
    updatedAt: now,
  });
}
