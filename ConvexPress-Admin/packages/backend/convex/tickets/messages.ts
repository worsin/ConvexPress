/**
 * Ticket System - Message Functions
 *
 * Query and mutation functions for ticket messages:
 *   getByTicket       - All messages for a ticket (admin, includes internal)
 *   getPublicByTicket - Public messages only (no internal notes)
 *   getCount          - Message count for a ticket
 *   edit              - Edit a message (15-min window for users, anytime for admins)
 *   remove            - Remove a message (soft: replaces content)
 *   addInternalNote   - Add an internal note (admin only)
 *   addSystemMessage  - Add a system-generated message
 */

import { ConvexError } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import {
  requireCan,
  requireAuth,
  getCurrentUser,
  currentUserCan,
} from "../helpers/permissions";
import {
  getMessagesByTicketArgs,
  getPublicMessagesByTicketArgs,
  getMessageCountArgs,
  editMessageArgs,
  removeMessageArgs,
  addInternalNoteArgs,
  addSystemMessageArgs,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  MAX_ATTACHMENTS,
} from "./validators";

// ─── getByTicket ────────────────────────────────────────────────────────────

/**
 * All messages for a ticket, including internal notes.
 * Requires ticket.viewInternalNotes for internal notes to appear.
 * Messages ordered by sequence number.
 */
export const getByTicket = query({
  args: getMessagesByTicketArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    // Access check
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    const canViewInternal = await currentUserCan(
      ctx,
      "ticket.viewInternalNotes",
    );

    const messages = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    return canViewInternal
      ? messages
      : messages.filter((m) => !m.isInternal);
  },
});

// ─── getPublicByTicket ──────────────────────────────────────────────────────

/**
 * Public messages only (no internal notes). For website ticket thread view.
 * Ordered by sequence number.
 */
export const getPublicByTicket = query({
  args: getPublicMessagesByTicketArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    // Access check: own ticket or ticket.viewAll
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    const messages = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    return messages.filter((m) => !m.isInternal);
  },
});

// ─── getCount ───────────────────────────────────────────────────────────────

/**
 * Get the public message count for a ticket.
 */
export const getCount = query({
  args: getMessageCountArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    // Access check
    if (ticket.userId !== user._id) {
      const canViewAll = await currentUserCan(ctx, "ticket.viewAll");
      if (!canViewAll) return null;
    }

    const messages = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    const publicCount = messages.filter((m) => !m.isInternal).length;
    const internalCount = messages.filter((m) => m.isInternal).length;

    return { publicCount, internalCount, totalCount: messages.length };
  },
});

// ─── edit ───────────────────────────────────────────────────────────────────

/**
 * Edit a message.
 *
 * Users can edit their own messages within a 15-minute window.
 * Admins with ticket.respond can edit any non-system message.
 */
export const edit = mutation({
  args: editMessageArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Message not found" });
    }

    // System messages cannot be edited
    if (message.senderType === "system") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "System messages cannot be edited",
      });
    }

    // Validate content
    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Message must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }

    const isOwner = message.senderId === user._id;
    const now = Date.now();

    if (isOwner) {
      // User can edit within the 15-minute window
      if (now - message.createdAt > MESSAGE_EDIT_WINDOW_MS) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Edit window has expired (15 minutes)",
        });
      }
    } else {
      // Non-owner needs ticket.respond capability
      await requireCan(ctx, "ticket.respond");
    }

    await ctx.db.patch(args.messageId, {
      content: args.content.trim(),
      editedAt: now,
    });

    return { messageId: args.messageId };
  },
});

// ─── remove ─────────────────────────────────────────────────────────────────

/**
 * Remove a message (soft delete: replaces content with "[Message removed]").
 * Requires ticket.respond capability.
 */
export const remove = mutation({
  args: removeMessageArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.respond");

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Message not found" });
    }

    // Don't allow removing the initial description (sequence 0)
    if (message.sequence === 0) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "The initial ticket description cannot be removed",
      });
    }

    // Soft delete: replace content but keep the message record.
    // messageCount is NOT decremented because the message still exists.
    await ctx.db.patch(args.messageId, {
      content: "[Message removed]",
      attachments: undefined,
      editedAt: Date.now(),
    });

    return { messageId: args.messageId };
  },
});

// ─── addInternalNote ────────────────────────────────────────────────────────

/**
 * Add an internal note to a ticket. Only visible to staff with
 * ticket.viewInternalNotes capability. Does NOT trigger auto-status
 * transitions or update lastMessageAt (since it's not user-visible).
 */
export const addInternalNote = mutation({
  args: addInternalNoteArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.viewInternalNotes");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Note must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.attachments && args.attachments.length > MAX_ATTACHMENTS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_ATTACHMENTS} attachments per message`,
      });
    }

    // Compute next sequence
    const lastMessage = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .first();
    const sequence = (lastMessage?.sequence ?? -1) + 1;

    const now = Date.now();
    const senderName =
      user.displayName || user.firstName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.email;

    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "admin",
      senderId: user._id,
      senderName,
      senderEmail: user.email,
      content: args.content.trim(),
      isInternal: true,
      attachments: args.attachments,
      createdAt: now,
    });

    // Update message count but NOT lastMessageAt (internal note)
    await ctx.db.patch(args.ticketId, {
      messageCount: ticket.messageCount + 1,
      updatedAt: now,
    });

    return { messageId };
  },
});

// ─── addSystemMessage ───────────────────────────────────────────────────────

/**
 * Add a system-generated message to a ticket.
 * Used for auto-status transitions, assignments, etc.
 * This is an internal helper -- not directly callable by clients.
 * Wrapped as a mutation so it can be called from other mutations.
 */
export const addSystemMessage = internalMutation({
  args: addSystemMessageArgs,
  handler: async (ctx, args) => {

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Compute next sequence
    const lastMessage = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .first();
    const sequence = (lastMessage?.sequence ?? -1) + 1;

    const now = Date.now();

    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "system",
      senderName: "System",
      content: args.content,
      isInternal: false,
      createdAt: now,
    });

    await ctx.db.patch(args.ticketId, {
      messageCount: ticket.messageCount + 1,
      updatedAt: now,
    });

    return { messageId };
  },
});
