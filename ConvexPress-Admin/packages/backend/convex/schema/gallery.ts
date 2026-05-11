import { defineTable } from "convex/server";
import { v } from "convex/values";

export const galleryAlbumStatusValidator = v.union(
  v.literal("draft"),
  v.literal("publish"),
  v.literal("private"),
  v.literal("trash"),
);

export const galleryLayoutValidator = v.union(
  v.literal("grid"),
  v.literal("masonry"),
);

export const galleryVisibilityValidator = v.union(
  v.literal("public"),
  v.literal("private"),
);

export const galleryTables = {
  gallery_categories: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    albumCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"])
    .index("by_count", ["albumCount"]),

  gallery_albums: defineTable({
    title: v.string(),
    slug: v.string(),
    excerpt: v.optional(v.string()),
    description: v.optional(v.string()),
    status: galleryAlbumStatusValidator,
    visibility: galleryVisibilityValidator,
    authorId: v.id("users"),
    coverMediaId: v.optional(v.id("media")),
    categoryIds: v.array(v.id("gallery_categories")),
    layoutPreset: galleryLayoutValidator,
    columnsDesktop: v.number(),
    columnsTablet: v.number(),
    columnsMobile: v.number(),
    lightboxEnabled: v.boolean(),
    captionsEnabled: v.boolean(),
    downloadEnabled: v.boolean(),
    itemCount: v.number(),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_author", ["authorId"])
    .index("by_status_published", ["status", "publishedAt"])
    .searchIndex("search_gallery_albums", {
      searchField: "title",
      filterFields: ["status", "authorId"],
    }),

  gallery_albumItems: defineTable({
    albumId: v.id("gallery_albums"),
    mediaId: v.id("media"),
    sortOrder: v.number(),
    caption: v.optional(v.string()),
    altText: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_album", ["albumId"])
    .index("by_album_sort", ["albumId", "sortOrder"])
    .index("by_media", ["mediaId"]),
};
