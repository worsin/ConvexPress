// @ts-nocheck
"use node";

import { v } from "convex/values";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================
// DOWNLOAD URL GENERATION
// ============================================

/**
 * Generate a temporary download URL for a token.
 * This is an action because it needs to call storage.getUrl()
 * which is not available in queries/mutations.
 */
export const generateDownloadUrl = action({
  args: {
    token: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any): Promise<
    | { success: false; error: string }
    | { success: true; url: string; fileName: string; mimeType: string }
  > => {
    // First validate and record the download via internal mutation
    const result = await ctx.runMutation(
      internal.commerceDigital.mutations.recordDownloadInternal,
      {
        token: args.token,
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      }
    );

    if (!result.success) {
      return {
        success: false as const,
        error: result.error ?? "Unknown error",
      };
    }

    // Ensure storageId exists
    if (!result.storageId) {
      return {
        success: false as const,
        error: "Storage ID not found",
      };
    }

    // Get a temporary URL from Convex storage
    const url = await ctx.storage.getUrl(result.storageId);

    if (!url) {
      return {
        success: false as const,
        error: "Failed to generate download URL",
      };
    }

    return {
      success: true as const,
      url,
      fileName: result.fileName ?? "",
      mimeType: result.mimeType ?? "",
    };
  },
});
