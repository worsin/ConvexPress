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
import { requirePluginEnabled } from "../helpers/plugins";

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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const autoCloseResolved = internalMutation({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  args: { batchSize: v.optional(v.number()) },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const batchSize = args.batchSize ?? 100;

    // Read auto-close setting
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "ticket.general"))
      .unique();

    const autoCloseAfterDays = setting?.values?.autoCloseAfterDays ?? 14;

    if (autoCloseAfterDays === 0) {
      return { closed: 0, message: "Auto-close is disabled" };
    }

    const cutoffMs = Date.now() - autoCloseAfterDays * 24 * 60 * 60 * 1000;

    // Find resolved tickets older than the cutoff.
    // Safety-bounded with .take() to avoid unbounded memory usage in crons.
    const resolvedTickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_status", (q: ConvexQueryBuilder) => q.eq("status", "resolved"))
      .take(batchSize * 3);

    const toClose = resolvedTickets
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .filter((t) => t.resolvedAt && t.resolvedAt < cutoffMs)
      .slice(0, batchSize);

    const now = Date.now();
    for (const ticket of toClose) {
      await ctx.db.patch("ticket_tickets", ticket._id, {
        status: "closed",
        closedAt: now,
        updatedAt: now,
      });

      // Add system message
      const lastMessage = await ctx.db
        .query("ticket_messages")
        .withIndex("by_ticket_sequence", (q: ConvexQueryBuilder) =>
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
      await ctx.db.patch("ticket_tickets", ticket._id, {
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const cleanupAll = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requirePluginEnabled(ctx, "tickets");
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
