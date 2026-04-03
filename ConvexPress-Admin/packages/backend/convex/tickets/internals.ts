/**
 * Ticket System - Internal Functions
 *
 * Not callable from clients. Used by:
 *   - Cron jobs (autoCloseResolved, cleanupAll)
 *   - Other internal functions
 *
 * Cron schedule:
 *   - autoCloseResolved: daily at 02:00 UTC
 *   - cleanupAll: daily at 03:00 UTC (sessions + rate limits)
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { emitEvent } from "../helpers/events";
import { TICKET_EVENTS, SYSTEM } from "../events/constants";
import { v } from "convex/values";

// ─── autoCloseResolved ──────────────────────────────────────────────────────

/**
 * Automatically close tickets that have been in "resolved" status for
 * longer than the configured auto-close period.
 *
 * Default: 14 days. Configurable via ticket.general.autoCloseAfterDays setting.
 * Set to 0 to disable auto-close.
 *
 * Processes in batches to stay within mutation time limits.
 */
export const autoCloseResolved = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;

    // Read auto-close setting
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "ticket.general"))
      .unique();

    const autoCloseAfterDays = setting?.values?.autoCloseAfterDays ?? 14;

    if (autoCloseAfterDays === 0) {
      return { closed: 0, message: "Auto-close is disabled" };
    }

    const cutoffMs = Date.now() - autoCloseAfterDays * 24 * 60 * 60 * 1000;

    // Find resolved tickets older than the cutoff
    const resolvedTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q) => q.eq("status", "resolved"))
      .collect();

    const toClose = resolvedTickets
      .filter((t) => t.resolvedAt && t.resolvedAt < cutoffMs)
      .slice(0, batchSize);

    const now = Date.now();
    for (const ticket of toClose) {
      await ctx.db.patch(ticket._id, {
        status: "closed",
        closedAt: now,
        updatedAt: now,
      });

      // Add system message
      const lastMessage = await ctx.db
        .query("ticket_messages")
        .withIndex("by_ticket_sequence", (q) =>
          q.eq("ticketId", ticket._id),
        )
        .order("desc")
        .first();
      const sequence = (lastMessage?.sequence ?? -1) + 1;

      await ctx.db.insert("ticket_messages", {
        ticketId: ticket._id,
        sequence,
        senderType: "system",
        senderName: "System",
        content: `This ticket was automatically closed after ${autoCloseAfterDays} days in resolved status.`,
        isInternal: false,
        createdAt: now,
      });

      // Increment messageCount for the system message
      await ctx.db.patch(ticket._id, {
        messageCount: ticket.messageCount + 1,
        updatedAt: now,
      });

      // Emit CLOSED event
      await emitEvent(ctx, TICKET_EVENTS.CLOSED, SYSTEM.TICKET, {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        previousStatus: ticket.status,
        autoClosedAfterDays: autoCloseAfterDays,
      });
    }

    // If we hit the batch limit, schedule another run
    if (toClose.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.tickets.internals.autoCloseResolved,
        { batchSize },
      );
    }

    return { closed: toClose.length };
  },
});

// ─── cleanupAll ─────────────────────────────────────────────────────────────

/**
 * Orchestrator that triggers cleanup of sessions and rate limit records.
 * Called by daily cron.
 */
export const cleanupAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Schedule session cleanup
    await ctx.scheduler.runAfter(
      0,
      internal.tickets.sessions.cleanupExpired,
      {},
    );

    // Schedule rate limit cleanup
    await ctx.scheduler.runAfter(
      0,
      internal.tickets.rateLimit.cleanup,
      {},
    );
  },
});
