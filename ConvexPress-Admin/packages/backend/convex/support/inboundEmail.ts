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

import { internalMutation, internalQuery } from "../_generated/server";
import {
  parseInboundChannelSecurity,
  type InboundChannelSecurity,
} from "./inboundSecurity";
import { isPluginEnabled } from "../helpers/plugins";

type InboundChannelSecurityResult =
  | { exists: false; active: false }
  | { exists: true; active: boolean; security: InboundChannelSecurity };

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getInboundChannelSecurity = internalQuery({
  args: {
    channelCode: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<InboundChannelSecurityResult> => {
    if (!(await isPluginEnabled(ctx, "tickets"))) {
      return { exists: false as const, active: false as const };
    }
    const channel = await ctx.db
      .query("support_channels")
      .withIndex("by_code", (q: any) => q.eq("code", args.channelCode))
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordInboundEmail = internalMutation({
  args: {
    channelCode: v.string(),
    externalId: v.string(),
    fromEmail: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    fromName: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    rawPayload: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    ticketNumber: v.optional(v.string()),
    receivedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) {
      return { ok: false as const, reason: "tickets_disabled" as const };
    }
    // 1. Resolve channel.
    const channel = await ctx.db
      .query("support_channels")
      .withIndex("by_code", (q: any) => q.eq("code", args.channelCode))
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
      .withIndex("by_channel_external_id", (q: any) =>
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
      .withIndex("by_email", (q: any) =>
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
      await ctx.db.patch(channel._id, {
        lastInboundAt: args.receivedAt,
        updatedAt: Date.now(),
      });
      return {
        ok: false as const,
        reason: "unknown_user" as const,
        eventId: errId,
      };
    }

    // 4. Existing-ticket append path.
    let ticketId: any = undefined;
    if (args.ticketNumber) {
      const existing = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_ticket_number", (q: any) =>
          q.eq("ticketNumber", args.ticketNumber!),
        )
        .unique();
      if (existing) {
        ticketId = existing._id;
        const seq = (existing.messageCount ?? 0) + 1;
        await ctx.db.insert("ticket_messages", {
          ticketId,
          sequence: seq,
          senderType: "user" as const,
          senderId: user._id,
          senderName:
            args.fromName ?? user.displayName ?? user.email ?? "Customer",
          senderEmail: args.fromEmail,
          content: args.body,
          isInternal: false,
          createdAt: args.receivedAt,
        });
        await ctx.db.patch(ticketId, {
          status:
            existing.status === "closed"
              ? ("open" as const)
              : existing.status,
          messageCount: seq,
          lastMessageAt: args.receivedAt,
          updatedAt: args.receivedAt,
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
        sequence: 1,
        senderType: "user" as const,
        senderId: user._id,
        senderName,
        senderEmail: args.fromEmail,
        content: args.body,
        isInternal: false,
        createdAt: args.receivedAt,
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
      await ctx.db.patch(prior._id, {
        status: "ticket_created" as const,
        ticketId: String(ticketId),
        errorMessage: undefined,
      });
    }

    // 7. Touch channel.
    await ctx.db.patch(channel._id, {
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

async function allocateTicketNumber(ctx: any, nowMs: number): Promise<string> {
  const d = new Date(nowMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const counterRow = await ctx.db
    .query("ticket_counters")
    .withIndex("by_year_month", (q: any) =>
      q.eq("year", year).eq("month", month),
    )
    .unique();
  const next = (counterRow?.counter ?? 0) + 1;
  if (counterRow) {
    await ctx.db.patch(counterRow._id, { counter: next });
  } else {
    await ctx.db.insert("ticket_counters", { year, month, counter: next });
  }
  const ym = `${year}${String(month).padStart(2, "0")}`;
  return `TKT-${ym}-${String(next).padStart(5, "0")}`;
}
