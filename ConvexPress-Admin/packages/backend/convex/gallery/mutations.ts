import { ConvexError } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  getRoleLevel,
  getUniqueAlbumSlug,
  getUniqueCategorySlug,
  recomputeCategoryCounts,
  replaceAlbumItems,
  requireImageMedia,
} from "./helpers";
import {
  createAlbumArgs,
  createCategoryArgs,
  deleteCategoryArgs,
  setAlbumItemsArgs,
  trashAlbumArgs,
  updateAlbumArgs,
  updateCategoryArgs,
} from "./validators";
import { requirePluginEnabled } from "../helpers/plugins";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createCategory = mutation({
  args: createCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "gallery");
    await requireCan(ctx, "manage_options");

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Category name is required",
      });
    }

    const slug = await getUniqueCategorySlug(ctx, trimmedName);
    const now = Date.now();

    return ctx.db.insert("gallery_categories", {
      name: trimmedName,
      slug,
      description: args.description?.trim() || undefined,
      albumCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateCategory = mutation({
  args: updateCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "gallery");
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get("gallery_categories", args.categoryId);
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Gallery category not found",
      });
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (!trimmedName) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Category name is required",
        });
      }
      patch.name = trimmedName;
      patch.slug = await getUniqueCategorySlug(
        ctx,
        trimmedName,
        args.categoryId.toString(),
      );
    }

    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }

    await ctx.db.patch("gallery_categories", args.categoryId, patch);
    return args.categoryId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteCategory = mutation({
  args: deleteCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "gallery");
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get("gallery_categories", args.categoryId);
    if (!category) return null;

    const albums = await ctx.db.query("gallery_albums").take(5000);
    for (const album of albums) {
      if (
        album.categoryIds.some(
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
          (categoryId) => categoryId.toString() === args.categoryId.toString(),
        )
      ) {
        await ctx.db.patch("gallery_albums", album._id, {
          categoryIds: album.categoryIds.filter(
            // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
            (categoryId) =>
              categoryId.toString() !== args.categoryId.toString(),
          ),
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete("gallery_categories", args.categoryId);
    return args.categoryId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createAlbum = mutation({
  args: createAlbumArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "gallery");
    const user = await requireCan(ctx, "post.create");

    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Album title is required",
      });
    }

    if (args.coverMediaId) {
      await requireImageMedia(ctx, args.coverMediaId.toString());
    }

    const categoryIds = args.categoryIds ?? [];
    const slug = await getUniqueAlbumSlug(ctx, args.slug ?? title);
    const now = Date.now();
    const status = args.status ?? "draft";

    const albumId = await ctx.db.insert("gallery_albums", {
      title,
      slug,
      excerpt: args.excerpt?.trim() || undefined,
      description: args.description?.trim() || undefined,
      status,
      visibility: args.visibility ?? "public",
      authorId: user._id,
      coverMediaId: args.coverMediaId,
      categoryIds,
      layoutPreset: args.layoutPreset ?? "grid",
      columnsDesktop: args.columnsDesktop ?? 3,
      columnsTablet: args.columnsTablet ?? 2,
      columnsMobile: args.columnsMobile ?? 1,
      lightboxEnabled: args.lightboxEnabled ?? true,
      captionsEnabled: args.captionsEnabled ?? true,
      downloadEnabled: args.downloadEnabled ?? false,
      itemCount: args.items?.length ?? 0,
      publishedAt: status === "publish" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    if (args.items?.length) {
      await replaceAlbumItems(
        ctx,
        albumId.toString(),
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        args.items.map((item) => ({
          mediaId: item.mediaId.toString(),
          caption: item.caption,
          altText: item.altText,
          linkUrl: item.linkUrl,
        })),
      );
    }

    await recomputeCategoryCounts(
      ctx,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      categoryIds.map((id) => id.toString()),
    );

    return albumId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateAlbum = mutation({
  args: updateAlbumArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "gallery");
    const user = await requireCan(ctx, "post.update");
    const album = await ctx.db.get("gallery_albums", args.albumId);
    if (!album) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Album not found",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    if (roleLevel < 80 && album.authorId.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot edit this album",
      });
    }

    if (args.coverMediaId) {
      await requireImageMedia(ctx, args.coverMediaId.toString());
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Album title is required",
        });
      }
      patch.title = title;
      patch.slug = await getUniqueAlbumSlug(
        ctx,
        args.slug ?? title,
        args.albumId.toString(),
      );
    } else if (args.slug !== undefined) {
      patch.slug = await getUniqueAlbumSlug(
        ctx,
        args.slug,
        args.albumId.toString(),
      );
    }

    if (args.excerpt !== undefined) patch.excerpt = args.excerpt.trim() || undefined;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "publish" && album.status !== "publish") {
        patch.publishedAt = args.publishedAt ?? Date.now();
      }
    }
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.coverMediaId !== undefined) patch.coverMediaId = args.coverMediaId;
    if (args.categoryIds !== undefined) patch.categoryIds = args.categoryIds;
    if (args.layoutPreset !== undefined) patch.layoutPreset = args.layoutPreset;
    if (args.columnsDesktop !== undefined) patch.columnsDesktop = args.columnsDesktop;
    if (args.columnsTablet !== undefined) patch.columnsTablet = args.columnsTablet;
    if (args.columnsMobile !== undefined) patch.columnsMobile = args.columnsMobile;
    if (args.lightboxEnabled !== undefined) patch.lightboxEnabled = args.lightboxEnabled;
    if (args.captionsEnabled !== undefined) patch.captionsEnabled = args.captionsEnabled;
    if (args.downloadEnabled !== undefined) patch.downloadEnabled = args.downloadEnabled;

    await ctx.db.patch("gallery_albums", args.albumId, patch);

    const touchedCategoryIds = new Set([
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      ...album.categoryIds.map((id) => id.toString()),
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      ...((args.categoryIds ?? []).map((id) => id.toString())),
    ]);
    await recomputeCategoryCounts(ctx, [...touchedCategoryIds]);

    return args.albumId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const setAlbumItems = mutation({
  args: setAlbumItemsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "gallery");
    const user = await requireCan(ctx, "post.update");
    const album = await ctx.db.get("gallery_albums", args.albumId);
    if (!album) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Album not found",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    if (roleLevel < 80 && album.authorId.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot edit this album",
      });
    }

    await replaceAlbumItems(
      ctx,
      args.albumId.toString(),
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      args.items.map((item) => ({
        mediaId: item.mediaId.toString(),
        caption: item.caption,
        altText: item.altText,
        linkUrl: item.linkUrl,
      })),
    );

    return args.albumId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const trashAlbum = mutation({
  args: trashAlbumArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "gallery");
    const user = await requireCan(ctx, "post.update");
    const album = await ctx.db.get("gallery_albums", args.albumId);
    if (!album) return null;

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    if (roleLevel < 80 && album.authorId.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot edit this album",
      });
    }

    await ctx.db.patch("gallery_albums", args.albumId, {
      status: "trash",
      updatedAt: Date.now(),
    });

    await recomputeCategoryCounts(
      ctx,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      album.categoryIds.map((id) => id.toString()),
    );

    return args.albumId;
  },
});
