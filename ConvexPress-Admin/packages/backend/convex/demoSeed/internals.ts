// @ts-nocheck
// Shared media import for the retained demo-shop workflow. Legacy content seeding is retired.
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
type AnyCtx = any;

async function getSeedUserId(ctx: AnyCtx): Promise<Id<"users">> {
  const users = await ctx.db.query("users").collect();
  const activeUser = users.find((user: { status?: string }) => user.status === "active") ?? users[0];

  if (!activeUser) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "No active user found for demo seeding",
    });
  }

  return activeUser._id;
}

export const createImportedMediaRecord = internalMutation({
  args: {
    storageId: v.id("_storage"),
    fileSize: v.number(),
    mimeType: v.string(),
    title: v.string(),
    fileName: v.string(),
    altText: v.optional(v.string()),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uploadedBy = await getSeedUserId(ctx);
    const slugBase = args.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "demo-image";
    let slug = slugBase;
    let counter = 1;

    while (
      await ctx.db
        .query("media")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      counter += 1;
      slug = `${slugBase}-${counter}`;
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new ConvexError({
        code: "STORAGE_ERROR",
        message: "Unable to resolve uploaded media URL",
      });
    }

    const mediaId = await ctx.db.insert("media", {
      title: args.title,
      fileName: args.fileName,
      slug,
      altText: args.altText,
      caption: args.caption,
      description: args.description,
      storageId: args.storageId,
      url,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      mediaType: "image",
      width: args.width,
      height: args.height,
      status: "active",
      uploadedBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      mediaId,
      url,
      title: args.title,
    };
  },
});
