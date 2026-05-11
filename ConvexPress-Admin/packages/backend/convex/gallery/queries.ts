import { ConvexError } from "convex/values";

import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import {
  enrichAlbum,
  enrichCategories,
  getRoleLevel,
  isGalleryEnabled,
  slugify,
} from "./helpers";
import {
  getAlbumArgs,
  getAlbumBySlugArgs,
  getAlbumEmbedArgs,
  listAlbumsArgs,
  listPublishedAlbumsArgs,
} from "./validators";
import { isPluginEnabled } from "../helpers/plugins";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listCategories = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return null;
    const categories = await ctx.db.query("gallery_categories").take(200);
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    categories.sort((a, b) => a.name.localeCompare(b.name));
    return categories;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: listAlbumsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    const allAlbums = await ctx.db.query("gallery_albums").take(1000);
    const searchLower = args.search?.trim().toLowerCase();

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    let filtered = allAlbums.filter((album) =>
      roleLevel >= 80 ? true : album.authorId.toString() === user._id.toString(),
    );

    if (args.status) {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      filtered = filtered.filter((album) => album.status === args.status);
    } else {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      filtered = filtered.filter((album) => album.status !== "trash");
    }

    if (searchLower) {
      filtered = filtered.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (album) =>
          album.title.toLowerCase().includes(searchLower) ||
          album.slug.toLowerCase().includes(searchLower),
      );
    }

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    filtered.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    // @ts-expect-error TS2589 TS7006: Convex generated API types (see feedback_typecheck_deploy.md).
    return Promise.all(filtered.map((album) => enrichAlbum(ctx, album)));
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const counts = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return null;
    const enabled = await isGalleryEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    const visibleAlbums = (await ctx.db.query("gallery_albums").take(1000)).filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (album) =>
        roleLevel >= 80 || album.authorId.toString() === user._id.toString(),
    );

    return {
      enabled,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      all: visibleAlbums.filter((album) => album.status !== "trash").length,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      draft: visibleAlbums.filter((album) => album.status === "draft").length,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      published: visibleAlbums.filter((album) => album.status === "publish")
        .length,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      private: visibleAlbums.filter((album) => album.status === "private").length,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      trash: visibleAlbums.filter((album) => album.status === "trash").length,
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  args: getAlbumArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const album = await ctx.db.get("gallery_albums", args.albumId);
    if (!album) return null;

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    if (roleLevel < 80 && album.authorId.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot access this album",
      });
    }

    return enrichAlbum(ctx, album);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listPublished = query({
  args: listPublishedAlbumsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return null;
    if (!(await isGalleryEnabled(ctx))) {
      return {
        albums: [],
        page: 1,
        perPage: 12,
        total: 0,
        totalPages: 0,
        category: null,
      };
    }

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(24, Math.max(1, args.perPage ?? 12));
    const allAlbums = await ctx.db.query("gallery_albums").take(1000);
    const categories = await ctx.db.query("gallery_categories").take(500);
    const category =
      args.categorySlug && args.categorySlug.length > 0
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        ? categories.find((entry) => entry.slug === args.categorySlug) ?? null
        : null;

    let filtered = allAlbums.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (album) => album.status === "publish" && album.visibility === "public",
    );

    if (args.categorySlug) {
      filtered = category
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        ? filtered.filter((album) =>
            album.categoryIds.some(
              // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
              (categoryId) => categoryId.toString() === category._id.toString(),
            ),
          )
        : [];
    }

    filtered.sort(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt),
    );

    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);

    return {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      albums: await Promise.all(items.map((album) => enrichAlbum(ctx, album))),
      page,
      perPage,
      total,
      totalPages,
      category,
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getBySlug = query({
  args: getAlbumBySlugArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return null;
    if (!(await isGalleryEnabled(ctx))) {
      return null;
    }

    const album = await ctx.db
      .query("gallery_albums")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", slugify(args.slug)))
      .unique();

    if (
      !album ||
      album.status !== "publish" ||
      album.visibility !== "public"
    ) {
      return null;
    }

    return enrichAlbum(ctx, album);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getEmbed = query({
  args: getAlbumEmbedArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return null;
    if (!(await isGalleryEnabled(ctx))) {
      return null;
    }

    const album = args.albumId
      ? await ctx.db.get("gallery_albums", args.albumId)
      : args.slug
        ? await ctx.db
            .query("gallery_albums")
            .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", slugify(args.slug!)))
            .unique()
        : null;

    if (
      !album ||
      album.status !== "publish" ||
      album.visibility !== "public"
    ) {
      return null;
    }

    const enriched = await enrichAlbum(ctx, album);
    const limit = args.limit ? Math.max(1, Math.min(24, args.limit)) : undefined;

    return {
      ...enriched,
      items: limit ? enriched.items.slice(0, limit) : enriched.items,
      embedSettings: {
        layoutPreset: args.layoutPreset ?? album.layoutPreset,
        columns: args.columns ?? album.columnsDesktop,
        showTitle: args.showTitle ?? true,
        showDescription: args.showDescription ?? true,
      },
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listPublicCategories = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "gallery"))) return null;
    if (!(await isGalleryEnabled(ctx))) {
      return [];
    }

    const categories = await ctx.db.query("gallery_categories").take(200);
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    categories.sort((a, b) => a.name.localeCompare(b.name));
    return enrichCategories(
      ctx,
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      categories.map((category) => category._id.toString()),
    );
  },
});
