/**
 * Ticket System - Customer Attachments
 *
 *   generateUploadUrl  - Issue a Convex storage upload URL for a ticket
 *                        attachment after validating name, MIME type and size.
 *
 * The website uploads the file to the returned URL, receives a storageId, and
 * passes { name, storageId, mimeType, size } to tickets.mutations.create or
 * tickets.mutations.reply, which validate the list again server-side.
 *
 * Limits live in tickets/customer.ts (pure, unit-tested): 10 MB per file,
 * 5 files per message, images / PDF / plain text only.
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAuth } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";
import { generateAttachmentUploadUrlArgs } from "./validators";
import {
  CUSTOMER_ATTACHMENT_MAX_BYTES,
  CUSTOMER_ATTACHMENT_MAX_COUNT,
  CUSTOMER_ATTACHMENT_TYPES,
  validateAttachmentMeta,
} from "./customer";

import { v } from "convex/values";
/**
 * Attachment limits for the website's file picker (mirrors customer.ts).
 */
export const getAttachmentLimits = query({
  args: {},
  returns: v.object({
    maxBytes: v.number(),
    maxCount: v.number(),
    mimeTypes: v.array(v.union(v.literal("image/png"), v.literal("image/jpeg"), v.literal("image/webp"), v.literal("image/gif"), v.literal("application/pdf"), v.literal("text/plain"))),
  }),
  handler: async () => ({
    maxBytes: CUSTOMER_ATTACHMENT_MAX_BYTES,
    maxCount: CUSTOMER_ATTACHMENT_MAX_COUNT,
    mimeTypes: [...CUSTOMER_ATTACHMENT_TYPES],
  }),
});

/**
 * Issue an upload URL for one ticket attachment. Any signed-in member may
 * upload (the ticket system is customer-facing); the metadata is validated
 * here so oversize or disallowed files are rejected before any bytes move.
 */
export const generateUploadUrl = mutation({
  args: generateAttachmentUploadUrlArgs,
  returns: v.object({ uploadUrl: v.string() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireAuth(ctx);
    const problem = validateAttachmentMeta({
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
    });
    if (problem) {
      throw new ConvexError({ code: "VALIDATION", message: problem });
    }
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});
