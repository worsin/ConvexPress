/**
 * Support — inbound email ticket creation (Wave 13).
 *
 * Internal mutation called by the /webhooks/inbound-email httpAction
 * after the raw provider payload is normalized via
 * `inboundEmailParser`. Idempotent via (channelId, externalId).
 *
 * Flow:
 *   1. Look up channel by code; reject if missing/inactive.
 *   2. Look up prior inbound event by (channelId, externalId); no-op
 *      if already processed (webhook retry).
 *   3. Resolve user by email (required by the tickets schema).
 *   4. If subject contains `[TKT-YYYYMM-NNNNN]` token, append the
 *      message to that existing ticket. Otherwise create a new ticket.
 *   5. Persist the inbound event pointing at the ticket.
 *   6. Touch `channel.lastInboundAt`.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  parseInboundChannelSecurity,
  type InboundChannelSecurity,
} from "./inboundSecurity";
import { isPluginEnabled } from "../helpers/plugins";
import { emitEvent } from "../helpers/events";
import { SYSTEM, TICKET_EVENTS } from "../events/constants";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";
import { statusAfterCustomerReply } from "../tickets/customer";


type InboundChannelSecurityResult =
  | { exists: false; active: false }
  | { exists: true; active: boolean; security: InboundChannelSecurity };

export const getInboundChannelSecurity = internalQuery({
  args: {
    channelCode: v.string(),
  },
  returns: v.union(v.object({ exists: v.literal(false), active: v.literal(false) }), v.object({
    exists: v.literal(true),
    active: v.boolean(),
    security: v.object({
      signingSecret: v.union(v.null(), v.string()),
      allowUnsigned: v.boolean(),
      signatureHeader: v.string(),
      timestampHeader: v.union(v.null(), v.string()),
      toleranceSeconds: v.number(),
    }),
  })),
  handler: async (ctx, args): Promise<InboundChannelSecurityResult> => {
    if (!(await isPluginEnabled(ctx, "tickets"))) {
      return { exists: false as const, active: false as const };
    }
    const channel = await ctx.db
      .query("support_channels")
      .withIndex("by_code", (q) => q.eq("code", args.channelCode))
      .unique();
    if (!channel) {
      return { exists: false as const, active: false as const };
    }
    return {
      exists: true as const,
      active: channel.isActive === true,
      security: parseInboundChannelSecurity(channel.config),
    };
  },
});

export const recordInboundEmail = internalMutation({
  args: {
    channelCode: v.string(),
    externalId: v.string(),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    rawPayload: v.string(),
    ticketNumber: v.optional(v.string()),
    receivedAt: v.number(),
  },
  returns: v.union(v.object({
    ok: v.literal(false),
    reason: v.literal("tickets_disabled"),
    idempotent: v.optional(v.null()),
    eventId: v.optional(v.null()),
    ticketId: v.optional(v.null()),
  }), v.object({
    ok: v.literal(false),
    reason: v.literal("channel_not_found"),
    idempotent: v.optional(v.null()),
    eventId: v.optional(v.null()),
    ticketId: v.optional(v.null()),
  }), v.object({
    ok: v.literal(false),
    reason: v.literal("channel_inactive"),
    idempotent: v.optional(v.null()),
    eventId: v.optional(v.null()),
    ticketId: v.optional(v.null()),
  }), v.object({
    ok: v.literal(true),
    idempotent: v.literal(true),
    eventId: v.id("support_inbound_events"),
    ticketId: v.optional(v.string()),
    reason: v.optional(v.null()),
  }), v.object({
    ok: v.literal(false),
    reason: v.literal("unknown_user"),
    eventId: v.id("support_inbound_events"),
    idempotent: v.optional(v.null()),
    ticketId: v.optional(v.null()),
  }), v.object({
    ok: v.literal(true),
    eventId: v.id("support_inbound_events"),
    ticketId: v.string(),
    reason: v.optional(v.null()),
    idempotent: v.optional(v.null()),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) {
      return { ok: false as const, reason: "tickets_disabled" as const };
    }
    // 1. Resolve channel.
    const channel = await ctx.db
      .query("support_channels")
      .withIndex("by_code", (q) => q.eq("code", args.channelCode))
      .unique();
    if (!channel) {
      return { ok: false as const, reason: "channel_not_found" as const };
    }
    if (!channel.isActive) {
      return { ok: false as const, reason: "channel_inactive" as const };
    }

    // 2. Idempotency guard.
    const prior = await ctx.db
      .query("support_inbound_events")
      .withIndex("by_channel_external_id", (q) =>
        q.eq("channelId", channel._id).eq("externalId", args.externalId),
      )
      .unique();
    if (prior && prior.status !== "error") {
      return {
        ok: true as const,
        idempotent: true as const,
        eventId: prior._id,
        ticketId: prior.ticketId,
      };
    }

    // 3. Resolve user — required by tickets schema.
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) =>
        q.eq("email", args.fromEmail.toLowerCase()),
      )
      .unique();

    if (!user) {
      const errId = await ctx.db.insert("support_inbound_events", {
        channelId: channel._id,
        externalId: args.externalId,
        rawPayload: args.rawPayload,
        status: "error" as const,
        errorMessage: `Unknown sender ${args.fromEmail}; tickets require a users._id.`,
        receivedAt: args.receivedAt,
      });
      await ctx.db.patch("support_channels", channel._id, {
        lastInboundAt: args.receivedAt,
        updatedAt: Date.now(),
      });
      return {
        ok: false as const,
        reason: "unknown_user" as const,
        eventId: errId,
      };
    }

    // 4. Existing-ticket append path: only the sender's own ticket. A ticket
    // number quoted by anyone else opens a new ticket instead.
    let ticketId: Id<"ticket_tickets"> | undefined = undefined;
    if (args.ticketNumber) {
      const existing = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_ticket_number", (q) =>
          q.eq("ticketNumber", args.ticketNumber!),
        )
        .unique();
      if (existing && existing.userId === user._id) {
        ticketId = existing._id;
        const last = await ctx.db
          .query("ticket_messages")
          .withIndex("by_ticket_sequence", (q) => q.eq("ticketId", existing._id))
          .order("desc")
          .first();
        const messageId = await ctx.db.insert("ticket_messages", {
          ticketId,
          sequence: (last?.sequence ?? -1) + 1,
          senderType: "user" as const,
          senderId: user._id,
          senderName:
            args.fromName ?? user.displayName ?? user.email ?? "Customer",
          senderEmail: args.fromEmail,
          content: args.body,
          isInternal: false,
          createdAt: args.receivedAt,
        });
        // As a reply from the website: the ticket waits on staff again, and a
        // resolved or closed one reopens.
        const status = statusAfterCustomerReply(existing.status);
        const reopened = status !== existing.status && (existing.status === "resolved" || existing.status === "closed");
        await patchDynamicWithMediaReferences(ctx, existing._id, {
          status,
          messageCount: existing.messageCount + 1,
          lastMessageAt: args.receivedAt,
          lastMessageSenderType: "user" as const,
          updatedAt: args.receivedAt,
          ...(reopened ? { resolvedAt: undefined, closedAt: undefined } : {}),
        });
        if (status !== existing.status) {
          await emitEvent(ctx, TICKET_EVENTS.STATUS_CHANGED, SYSTEM.TICKET, {
            ticketId: existing._id,
            ticketNumber: existing.ticketNumber,
            previousStatus: existing.status,
            newStatus: status,
            ticketOwnerId: existing.userId,
          });
        }
        await emitEvent(ctx, TICKET_EVENTS.REPLIED, SYSTEM.TICKET, {
          ticketId: existing._id,
          ticketNumber: existing.ticketNumber,
          messageId,
          senderType: "user",
          senderId: user._id,
          ticketOwnerId: existing.userId,
          assignedTo: existing.assignedTo ?? null,
          source: "email",
        });
      }
    }

    // 5. New-ticket path.
    if (!ticketId) {
      const ticketNumber = await allocateTicketNumber(ctx, args.receivedAt);
      const senderName =
        args.fromName ?? user.displayName ?? user.email ?? "Customer";
      ticketId = await ctx.db.insert("ticket_tickets", {
        ticketNumber,
        userId: user._id,
        userEmailSnapshot: args.fromEmail,
        userNameSnapshot: senderName,
        subject: args.subject,
        description: args.body,
        category: "other" as const,
        status: "open" as const,
        priority: "medium" as const,
        source: "email" as const,
        tags: [],
        aiAttempted: false,
        messageCount: 1,
        lastMessageAt: args.receivedAt,
        createdAt: args.receivedAt,
        updatedAt: args.receivedAt,
      });
      await ctx.db.insert("ticket_messages", {
        ticketId,
        // The opening message, as a ticket opened on the website has.
        sequence: 0,
        senderType: "user" as const,
        senderId: user._id,
        senderName,
        senderEmail: args.fromEmail,
        content: args.body,
        isInternal: false,
        createdAt: args.receivedAt,
      });
      await emitEvent(ctx, TICKET_EVENTS.CREATED, SYSTEM.TICKET, {
        ticketId,
        ticketNumber,
        userId: user._id,
        category: "other",
        priority: "medium",
        source: "email",
        aiAttempted: false,
      });
    }

    // 6. Persist / upgrade inbound event.
    const eventId = prior
      ? prior._id
      : await ctx.db.insert("support_inbound_events", {
          channelId: channel._id,
          externalId: args.externalId,
          rawPayload: args.rawPayload,
          ticketId: String(ticketId),
          status: "ticket_created" as const,
          receivedAt: args.receivedAt,
        });
    if (prior) {
      await ctx.db.patch("support_inbound_events", prior._id, {
        status: "ticket_created" as const,
        ticketId: String(ticketId),
        errorMessage: undefined,
      });
    }

    // 7. Touch channel.
    await ctx.db.patch("support_channels", channel._id, {
      lastInboundAt: args.receivedAt,
      updatedAt: Date.now(),
    });

    return {
      ok: true as const,
      eventId,
      ticketId: String(ticketId),
    };
  },
});

async function allocateTicketNumber(ctx: Pick<MutationCtx, "db">, nowMs: number): Promise<string> {
  const d = new Date(nowMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const counterRow = await ctx.db
    .query("ticket_counters")
    .withIndex("by_year_month", (q) =>
      q.eq("year", year).eq("month", month),
    )
    .unique();
  const next = (counterRow?.counter ?? 0) + 1;
  if (counterRow) {
    await patchDynamicWithMediaReferences(ctx, counterRow._id, { counter: next });
  } else {
    await ctx.db.insert("ticket_counters", { year, month, counter: next });
  }
  const ym = `${year}${String(month).padStart(2, "0")}`;
  return `TKT-${ym}-${String(next).padStart(5, "0")}`;
}
