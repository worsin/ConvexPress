// @ts-nocheck
import { v, ConvexError } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const importGeneratedMedia = internalAction({
  args: {
    title: v.string(),
    fileName: v.string(),
    altText: v.optional(v.string()),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    dataUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const match = args.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Expected a base64 data URL for generated media import",
      });
    }

    const [, mimeType, base64Payload] = match;
    const binary = atob(base64Payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType });
    const storageId = await ctx.storage.store(blob);

    return await ctx.runMutation(internal.demoSeed.internals.createImportedMediaRecord, {
      storageId,
      fileSize: bytes.byteLength,
      mimeType,
      title: args.title,
      fileName: args.fileName,
      altText: args.altText,
      caption: args.caption,
      description: args.description,
      width: args.width,
      height: args.height,
    });
  },
});
