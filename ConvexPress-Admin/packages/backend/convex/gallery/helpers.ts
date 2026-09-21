import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences, requireAttachableMedia } from "../media/attachmentGuard";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function getRoleLevel(ctx: any, roleId: string | undefined) {
  if (!roleId) return 0;
  const role = await ctx.db.get("roles", roleId as any);
  return role?.level ?? 0;
}

export async function isGalleryEnabled(ctx: any) {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", "plugins"))
    .unique();
  const values = (doc?.values as Record<string, unknown> | undefined) ?? {};
  return values.galleryEnabled !== false;
}

export async function getUniqueAlbumSlug(
  ctx: any,
  seed: string,
  excludeId?: string,
) {
  const base = slugify(seed) || "album";
  let slug = base;
  let counter = 2;

  while (true) {
    const existing = await ctx.db
      .query("gallery_albums")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .unique();
    if (!existing || existing._id.toString() === excludeId) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function getUniqueCategorySlug(
  ctx: any,
  seed: string,
  excludeId?: string,
) {
  const base = slugify(seed) || "gallery-category";
  let slug = base;
  let counter = 2;

  while (true) {
    const existing = await ctx.db
      .query("gallery_categories")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .unique();
    if (!existing || existing._id.toString() === excludeId) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function requireImageMedia(ctx: any, mediaId: string | undefined) {
  if (!mediaId) return null;
  const media = await requireAttachableMedia(ctx, mediaId as any);
  if (!media || media.mediaType !== "image") {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Gallery items must reference image media.",
    });
  }
  return media;
}

export async function enrichCategories(ctx: any, categoryIds: readonly string[]): Promise<Array<{ _id: string; name: string; slug: string; description?: string; albumCount: number } | null>> {
  return (
    await Promise.all(
      categoryIds.map(async (categoryId) => {
        const category = await ctx.db.get("gallery_categories", categoryId as any);
        if (!category) return null;
        return {
          _id: category._id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          albumCount: category.albumCount,
        };
      }),
    )
  ).filter(Boolean);
}

export async function enrichMedia(ctx: any, mediaId: string): Promise<Pick<Doc<"media">, "_id" | "title" | "url" | "altText" | "caption" | "width" | "height" | "mimeType"> | null> {
  const media = await ctx.db.get("media", mediaId as any);
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

export async function listAlbumItems(ctx: any, albumId: string) {
  const items = await ctx.db
    .query("gallery_albumItems")
    .withIndex("by_album_sort", (q: any) => q.eq("albumId", albumId as any))
    .collect();

  return (
    await Promise.all(
      items
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        .map(async (item: any) => {
          const media = await enrichMedia(ctx, item.mediaId.toString());
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
    )
  ).filter(Boolean);
}

export async function enrichAlbum(ctx: QueryCtx, album: Doc<"gallery_albums">): Promise<Doc<"gallery_albums"> & { categories: Awaited<ReturnType<typeof enrichCategories>>; items: Awaited<ReturnType<typeof listAlbumItems>>; coverMedia: Awaited<ReturnType<typeof enrichMedia>> }> {
  const categories = await enrichCategories(
    ctx,
    album.categoryIds.map((id: { toString(): string }) => id.toString()),
  );
  const items = await listAlbumItems(ctx, album._id.toString());
  const coverMedia =
    (album.coverMediaId && (await enrichMedia(ctx, album.coverMediaId.toString()))) ||
    (items[0]?.media ?? null);

  return {
    ...album,
    categories,
    items,
    coverMedia,
  };
}

export async function recomputeCategoryCounts(
  ctx: any,
  categoryIds: readonly string[],
) {
  if (categoryIds.length === 0) return;

  const albums = await ctx.db.query("gallery_albums").take(5000);
  for (const categoryId of categoryIds) {
    const count = albums.filter(
      (album: {
        status: string;
        categoryIds: Array<{ toString(): string }>;
      }) =>
        album.status === "publish" &&
        album.categoryIds.some((entry) => entry.toString() === categoryId),
    ).length;

    await ctx.db.patch("gallery_categories", categoryId as any, {
      albumCount: count,
      updatedAt: Date.now(),
    });
  }
}

export async function replaceAlbumItems(
  ctx: any,
  albumId: string,
  items: Array<{
    mediaId: string;
    caption?: string;
    altText?: string;
    linkUrl?: string;
  }>,
) {
  const existing = await ctx.db
    .query("gallery_albumItems")
    .withIndex("by_album", (q: any) => q.eq("albumId", albumId as any))
    .collect();

  await Promise.all(existing.map((item: any) => deleteWithMediaReferences<"gallery_albumItems">(ctx, "gallery_albumItems", item._id)));

  const now = Date.now();
  for (const [index, item] of items.entries()) {
    await requireImageMedia(ctx, item.mediaId);
    await insertWithMediaReferences<"gallery_albumItems">(ctx, "gallery_albumItems", {
      albumId: albumId as any,
      mediaId: item.mediaId as any,
      sortOrder: index,
      caption: item.caption?.trim() || undefined,
      altText: item.altText?.trim() || undefined,
      linkUrl: item.linkUrl?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  await patchWithMediaReferences<"gallery_albums">(ctx, "gallery_albums", albumId as any, {
    itemCount: items.length,
    updatedAt: now,
  });
}
