import { v } from "convex/values";

import {
  galleryAlbumStatusValidator,
  galleryLayoutValidator,
  galleryVisibilityValidator,
} from "../schema/gallery";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
const albumItemInputValidator = v.object({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  mediaId: v.id("media"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  caption: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  altText: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  linkUrl: v.optional(v.string()),
});

export const listAlbumsArgs = {
  search: v.optional(v.string()),
  status: v.optional(galleryAlbumStatusValidator),
};

export const getAlbumArgs = {
  albumId: v.id("gallery_albums"),
};

export const getAlbumBySlugArgs = {
  slug: v.string(),
};

export const listPublishedAlbumsArgs = {
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  categorySlug: v.optional(v.string()),
};

export const getAlbumEmbedArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  albumId: v.optional(v.id("gallery_albums")),
  slug: v.optional(v.string()),
  limit: v.optional(v.number()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  layoutPreset: v.optional(galleryLayoutValidator),
  columns: v.optional(v.number()),
  showTitle: v.optional(v.boolean()),
  showDescription: v.optional(v.boolean()),
};

export const createCategoryArgs = {
  name: v.string(),
  description: v.optional(v.string()),
};

export const updateCategoryArgs = {
  categoryId: v.id("gallery_categories"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
};

export const deleteCategoryArgs = {
  categoryId: v.id("gallery_categories"),
};

export const createAlbumArgs = {
  title: v.string(),
  slug: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(galleryAlbumStatusValidator),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  visibility: v.optional(galleryVisibilityValidator),
  coverMediaId: v.optional(v.id("media")),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  categoryIds: v.optional(v.array(v.id("gallery_categories"))),
  layoutPreset: v.optional(galleryLayoutValidator),
  columnsDesktop: v.optional(v.number()),
  columnsTablet: v.optional(v.number()),
  columnsMobile: v.optional(v.number()),
  lightboxEnabled: v.optional(v.boolean()),
  captionsEnabled: v.optional(v.boolean()),
  downloadEnabled: v.optional(v.boolean()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  items: v.optional(v.array(albumItemInputValidator)),
};

export const updateAlbumArgs = {
  albumId: v.id("gallery_albums"),
  title: v.optional(v.string()),
  slug: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(galleryAlbumStatusValidator),
  visibility: v.optional(galleryVisibilityValidator),
  coverMediaId: v.optional(v.id("media")),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  categoryIds: v.optional(v.array(v.id("gallery_categories"))),
  layoutPreset: v.optional(galleryLayoutValidator),
  columnsDesktop: v.optional(v.number()),
  columnsTablet: v.optional(v.number()),
  columnsMobile: v.optional(v.number()),
  lightboxEnabled: v.optional(v.boolean()),
  captionsEnabled: v.optional(v.boolean()),
  downloadEnabled: v.optional(v.boolean()),
  publishedAt: v.optional(v.number()),
};

export const setAlbumItemsArgs = {
  albumId: v.id("gallery_albums"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  items: v.array(albumItemInputValidator),
};

export const trashAlbumArgs = {
  albumId: v.id("gallery_albums"),
};
