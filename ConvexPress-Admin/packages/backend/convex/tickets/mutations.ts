/**
 * Ticket System - Mutations
 *
 * All write operations for the ticket lifecycle:
 *   create          - Create a new ticket with sequential numbering
 *   reply           - User replies to their own ticket
 *   adminReply      - Admin/staff replies to a ticket (supports internal notes)
 *   updateStatus    - Update ticket status with auto-transitions
 *   updatePriority  - Update ticket priority
 *   assign          - Assign ticket to a staff member
 *   unassign        - Remove ticket assignment
 *   close           - Close a ticket
 *   reopen          - Reopen a closed/resolved ticket
 *   rate            - Submit CSAT rating
 *   addTags         - Add tags to a ticket
 *   removeTags      - Remove tags from a ticket
 *
 * Authorization:
 *   - ticket.view: any authenticated user can create and reply to own tickets
 *   - ticket.viewAll + ticket.respond: staff can reply to any ticket
 *   - ticket.assign: assign tickets to staff
 *   - ticket.updateStatus: change ticket status
 *   - ticket.updatePriority: change ticket priority
 *   - ticket.close: force close tickets
 *   - ticket.manageCannedResponses: manage canned responses
 *
 * Auto-status transitions:
 *   - User replies to "awaitingResponse" -> status becomes "open"
 *   - Admin replies to "open" -> status becomes "awaitingResponse"
 *   - Admin explicitly resolves -> "resolved"
 *   - Auto-close resolved after N days (cron) -> "closed"
 *
 * All mutations emit events via the Event Dispatcher System.
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, requireAuth, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { TICKET_EVENTS, SYSTEM } from "../events/constants";
import {
  createTicketArgs,
  replyTicketArgs,
  adminReplyArgs,
  updateStatusArgs,
  updatePriorityArgs,
  assignTicketArgs,
  unassignTicketArgs,
  closeTicketArgs,
  reopenTicketArgs,
  rateTicketArgs,
  addTagsArgs,
  removeTagsArgs,
  MAX_SUBJECT_LENGTH,
  MIN_SUBJECT_LENGTH,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_RATING_COMMENT_LENGTH,
  MAX_ATTACHMENTS,
} from "./validators";

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a new support ticket with sequential numbering.
 *
 * Flow:
 *   1. Authenticate user
 *   2. Validate subject and description length
 *   3. Generate sequential ticket number (TKT-YYYYMM-XXXXX)
 *   4. Snapshot user email/name
 *   5. Insert ticket record
 *   6. Insert initial description as first message (sequence 0)
 *   7. Emit ticket.created event
 *
 * @returns { ticketId, ticketNumber }
 */
export const create = mutation({
  args: createTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // ── Validate input ──────────────────────────────────────────────────
    if (
      args.subject.trim().length < MIN_SUBJECT_LENGTH ||
      args.subject.trim().length > MAX_SUBJECT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Subject must be between ${MIN_SUBJECT_LENGTH} and ${MAX_SUBJECT_LENGTH} characters`,
      });
    }
    if (
      args.description.trim().length < MIN_CONTENT_LENGTH ||
      args.description.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Description must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.tags && args.tags.length > MAX_TAGS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_TAGS} tags allowed`,
      });
    }
    if (args.tags) {
      for (const tag of args.tags) {
        if (tag.length > MAX_TAG_LENGTH) {
          throw new ConvexError({
            code: "VALIDATION",
            message: `Tag "${tag}" exceeds maximum length of ${MAX_TAG_LENGTH} characters`,
          });
        }
      }
    }

    // ── Generate sequential ticket number ───────────────────────────────
    const now = Date.now();
    const date = new Date(now);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 1-12

    // Atomic counter increment
    const counterDoc = await ctx.db
      .query("ticket_counters")
      .withIndex("by_year_month", (q) => q.eq("year", year).eq("month", month))
      .unique();

    let counter: number;
    if (counterDoc) {
      counter = counterDoc.counter + 1;
      await ctx.db.patch(counterDoc._id, { counter });
    } else {
      counter = 1;
      await ctx.db.insert("ticket_counters", { year, month, counter });
    }

    const monthStr = String(month).padStart(2, "0");
    const counterStr = String(counter).padStart(5, "0");
    const ticketNumber = `TKT-${year}${monthStr}-${counterStr}`;

    // ── Snapshot user data ──────────────────────────────────────────────
    const userEmailSnapshot = user.email;
    const userNameSnapshot =
      user.displayName || user.firstName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.email;

    // ── Resolve default priority from settings ──────────────────────────
    let defaultPriority: "low" | "medium" | "high" = "medium";
    const prioritySetting = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();
    if (prioritySetting?.values?.ticketDefaultPriority) {
      defaultPriority = prioritySetting.values.ticketDefaultPriority;
    }

    // ── Insert ticket ───────────────────────────────────────────────────
    const ticketId = await ctx.db.insert("ticket_tickets", {
      ticketNumber,
      userId: user._id,
      userEmailSnapshot,
      userNameSnapshot,
      subject: args.subject.trim(),
      description: args.description.trim(),
      category: args.category,
      status: "open",
      priority: args.priority ?? defaultPriority,
      source: args.source ?? "dashboard",
      tags: args.tags ?? [],
      aiAttempted: args.aiAttempted ?? false,
      aiQuery: args.aiQuery,
      aiResponse: args.aiResponse,
      kbArticlesShown: args.kbArticlesShown,
      messageCount: 1, // Initial description counts as first message
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // ── Insert initial message (description as message #0) ──────────────
    await ctx.db.insert("ticket_messages", {
      ticketId,
      sequence: 0,
      senderType: "user",
      senderId: user._id,
      senderName: userNameSnapshot,
      senderEmail: userEmailSnapshot,
      content: args.description.trim(),
      isInternal: false,
      createdAt: now,
    });

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, TICKET_EVENTS.CREATED, SYSTEM.TICKET, {
      ticketId,
      ticketNumber,
      userId: user._id,
      category: args.category,
      priority: args.priority ?? defaultPriority,
      source: args.source ?? "dashboard",
      aiAttempted: args.aiAttempted ?? false,
    });

    return { ticketId, ticketNumber };
  },
});

// ─── Reply (User) ───────────────────────────────────────────────────────────

/**
 * User replies to their own ticket.
 *
 * Auto-transition: if ticket is "awaitingResponse", status becomes "open".
 * Increments messageCount and updates lastMessageAt.
 */
export const reply = mutation({
  args: replyTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // ── Validate ticket exists and belongs to user ──────────────────────
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }
    if (ticket.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only reply to your own tickets",
      });
    }
    if (ticket.status === "closed") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot reply to a closed ticket. Please reopen it first.",
      });
    }

    // ── Validate content ────────────────────────────────────────────────
    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Message must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.attachments && args.attachments.length > MAX_ATTACHMENTS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_ATTACHMENTS} attachments per message`,
      });
    }

    // ── Compute next sequence number ────────────────────────────────────
    const lastMessage = await ctx.db
      .query("ticket_messages")
      .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .first();
    const sequence = (lastMessage?.sequence ?? -1) + 1;

    const now = Date.now();
    const userNameSnapshot =
      user.displayName || user.firstName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.email;

    // ── Insert message ──────────────────────────────────────────────────
    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "user",
      senderId: user._id,
      senderName: userNameSnapshot,
      senderEmail: user.email,
      content: args.content.trim(),
      isInternal: false,
      attachments: args.attachments,
      createdAt: now,
    });

    // ── Auto-transition: awaitingResponse -> open ───────────────────────
    const updates: Record<string, unknown> = {
      messageCount: ticket.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
    };
    if (ticket.status === "awaitingResponse") {
      updates.status = "open";
    }
    await ctx.db.patch(args.ticketId, updates);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, TICKET_EVENTS.REPLIED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      messageId,
      senderType: "user",
      senderId: user._id,
    });

    return { messageId };
  },
});

// ─── Admin Reply ────────────────────────────────────────────────────────────

/**
 * Admin/staff replies to a ticket. Supports internal notes (isInternal=true).
 *
 * Auto-transition: if ticket is "open" and reply is NOT internal,
 * status becomes "awaitingResponse".
 *
 * If this is the first non-internal admin reply, records firstResponseAt for SLA.
 */
export const adminReply = mutation({
  args: adminReplyArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.respond");

    // ── Validate ticket exists ──────────────────────────────────────────
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // ── If internal note, require viewInternalNotes capability ──────────
    const isInternal = args.isInternal ?? false;
    if (isInternal) {
      await requireCan(ctx, "ticket.viewInternalNotes");
    }

    // ── Validate content ────────────────────────────────────────────────
    if (
      args.content.trim().length < MIN_CONTENT_LENGTH ||
      args.content.trim().length > MAX_CONTENT_LENGTH
    ) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Message must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters`,
      });
    }
    if (args.attachments && args.attachments.length > MAX_ATTACHMENTS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_ATTACHMENTS} attachments per message`,
      });
    }

    // ── Compute next sequence number ────────────────────────────────────
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

    // ── Insert message ──────────────────────────────────────────────────
    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      sequence,
      senderType: "admin",
      senderId: user._id,
      senderName,
      senderEmail: user.email,
      content: args.content.trim(),
      isInternal,
      attachments: args.attachments,
      createdAt: now,
    });

    // ── Update ticket ───────────────────────────────────────────────────
    const updates: Record<string, unknown> = {
      messageCount: ticket.messageCount + 1,
      lastMessageAt: now,
      updatedAt: now,
    };

    // Auto-transition: open -> awaitingResponse (only for non-internal replies)
    if (!isInternal && ticket.status === "open") {
      updates.status = "awaitingResponse";
    }

    // Track first response time for SLA
    if (!isInternal && !ticket.firstResponseAt) {
      updates.firstResponseAt = now;
    }

    await ctx.db.patch(args.ticketId, updates);

    // ── Emit event ──────────────────────────────────────────────────────
    await emitEvent(ctx, TICKET_EVENTS.REPLIED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      messageId,
      senderType: "admin",
      senderId: user._id,
      isInternal,
    });

    return { messageId };
  },
});

// ─── Update Status ──────────────────────────────────────────────────────────

/**
 * Update ticket status. Records lifecycle timestamps for SLA tracking:
 *   - "resolved" -> sets resolvedAt
 *   - "closed" -> sets closedAt
 *   - Reopening from "resolved"/"closed" -> clears resolvedAt/closedAt
 */
export const updateStatus = mutation({
  args: updateStatusArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updateStatus");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.status === args.status) {
      return; // No-op if status unchanged
    }

    const now = Date.now();
    const updates: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Set lifecycle timestamps
    if (args.status === "resolved" && !ticket.resolvedAt) {
      updates.resolvedAt = now;
    }
    if (args.status === "closed" && !ticket.closedAt) {
      updates.closedAt = now;
    }

    await ctx.db.patch(args.ticketId, updates);

    // ── Emit appropriate event ──────────────────────────────────────────
    const eventCode =
      args.status === "resolved"
        ? TICKET_EVENTS.RESOLVED
        : args.status === "closed"
          ? TICKET_EVENTS.CLOSED
          : TICKET_EVENTS.STATUS_CHANGED;

    await emitEvent(ctx, eventCode, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      previousStatus: ticket.status,
      newStatus: args.status,
      changedBy: user._id,
    });
  },
});

// ─── Update Priority ────────────────────────────────────────────────────────

/**
 * Update ticket priority.
 */
export const updatePriority = mutation({
  args: updatePriorityArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updatePriority");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.priority === args.priority) {
      return; // No-op
    }

    await ctx.db.patch(args.ticketId, {
      priority: args.priority,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, TICKET_EVENTS.STATUS_CHANGED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      field: "priority",
      previousPriority: ticket.priority,
      newPriority: args.priority,
      changedBy: user._id,
    });
  },
});

// ─── Assign ─────────────────────────────────────────────────────────────────

/**
 * Assign a ticket to a staff member.
 */
export const assign = mutation({
  args: assignTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.assign");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Validate assignee exists
    const assignee = await ctx.db.get(args.assigneeId);
    if (!assignee) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Assignee user not found",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.ticketId, {
      assignedTo: args.assigneeId,
      assignedAt: now,
      // Auto-transition to inProgress if currently open
      ...(ticket.status === "open" ? { status: "inProgress" } : {}),
      updatedAt: now,
    });

    await emitEvent(ctx, TICKET_EVENTS.ASSIGNED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      assignedTo: args.assigneeId,
      assignedBy: user._id,
      previousAssignee: ticket.assignedTo,
    });
  },
});

// ─── Unassign ───────────────────────────────────────────────────────────────

/**
 * Remove ticket assignment.
 */
export const unassign = mutation({
  args: unassignTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.assign");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    await ctx.db.patch(args.ticketId, {
      assignedTo: undefined,
      assignedAt: undefined,
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, TICKET_EVENTS.ASSIGNED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      assignedTo: null,
      unassignedBy: user._id,
      previousAssignee: ticket.assignedTo,
    });
  },
});

// ─── Close ──────────────────────────────────────────────────────────────────

/**
 * Force close a ticket. Requires ticket.close capability.
 */
export const close = mutation({
  args: closeTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.close");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.status === "closed") {
      return; // Already closed
    }

    const now = Date.now();
    await ctx.db.patch(args.ticketId, {
      status: "closed",
      closedAt: now,
      resolvedAt: ticket.resolvedAt ?? now,
      updatedAt: now,
    });

    await emitEvent(ctx, TICKET_EVENTS.CLOSED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      previousStatus: ticket.status,
      closedBy: user._id,
    });
  },
});

// ─── Reopen ─────────────────────────────────────────────────────────────────

/**
 * Reopen a resolved or closed ticket. Clears resolvedAt and closedAt.
 * The ticket owner can reopen their own ticket; staff need ticket.updateStatus.
 */
export const reopen = mutation({
  args: reopenTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Only resolved or closed tickets can be reopened",
      });
    }

    // Ticket owner can reopen their own ticket; staff need updateStatus cap
    if (ticket.userId !== user._id) {
      await requireCan(ctx, "ticket.updateStatus");
    }

    const now = Date.now();
    await ctx.db.patch(args.ticketId, {
      status: "open",
      resolvedAt: undefined,
      closedAt: undefined,
      updatedAt: now,
    });

    await emitEvent(ctx, TICKET_EVENTS.STATUS_CHANGED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      previousStatus: ticket.status,
      newStatus: "open",
      reopenedBy: user._id,
    });
  },
});

// ─── Rate ───────────────────────────────────────────────────────────────────

/**
 * Submit a CSAT rating for a resolved/closed ticket.
 * Only the ticket owner can rate. Rating is 1-5.
 */
export const rate = mutation({
  args: rateTicketArgs,
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    if (ticket.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the ticket owner can submit a rating",
      });
    }

    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Only resolved or closed tickets can be rated",
      });
    }

    if (ticket.rating !== undefined) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "This ticket has already been rated",
      });
    }

    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Rating must be an integer between 1 and 5",
      });
    }

    if (args.comment && args.comment.length > MAX_RATING_COMMENT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Rating comment must be at most ${MAX_RATING_COMMENT_LENGTH} characters`,
      });
    }

    await ctx.db.patch(args.ticketId, {
      rating: args.rating,
      ratingComment: args.comment?.trim(),
      updatedAt: Date.now(),
    });

    await emitEvent(ctx, TICKET_EVENTS.RATED, SYSTEM.TICKET, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      rating: args.rating,
      userId: user._id,
    });
  },
});

// ─── Add Tags ───────────────────────────────────────────────────────────────

/**
 * Add tags to a ticket. Deduplicates against existing tags.
 */
export const addTags = mutation({
  args: addTagsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updateStatus");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    // Validate tag constraints
    for (const tag of args.tags) {
      if (tag.trim().length === 0 || tag.length > MAX_TAG_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Tag must be between 1 and ${MAX_TAG_LENGTH} characters`,
        });
      }
    }

    // Deduplicate
    const existingTags = new Set(ticket.tags);
    const newTags = args.tags.filter((t) => !existingTags.has(t.trim()));
    const merged = [...ticket.tags, ...newTags.map((t) => t.trim())];

    if (merged.length > MAX_TAGS) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Maximum ${MAX_TAGS} tags allowed per ticket`,
      });
    }

    await ctx.db.patch(args.ticketId, {
      tags: merged,
      updatedAt: Date.now(),
    });
  },
});

// ─── Remove Tags ────────────────────────────────────────────────────────────

/**
 * Remove tags from a ticket.
 */
export const removeTags = mutation({
  args: removeTagsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "ticket.updateStatus");

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Ticket not found" });
    }

    const toRemove = new Set(args.tags);
    const filtered = ticket.tags.filter((t) => !toRemove.has(t));

    await ctx.db.patch(args.ticketId, {
      tags: filtered,
      updatedAt: Date.now(),
    });
  },
});
