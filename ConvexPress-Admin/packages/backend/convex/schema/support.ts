/**
 * Support Bridge System - Schema
 *
 * One table supporting AI deflection log tracking:
 *   - support_deflectionLogs - Records of AI deflection attempts and outcomes
 *
 * Key design decisions:
 *   - kbArticleIds stores article IDs as plain strings (not Id<"kb_articles">)
 *     for schema independence — the support system works without the KB system
 *   - ticketId stores ticket ID as a plain string (not Id<"ticket_tickets">)
 *     for the same reason
 *   - sessionId is a client-generated string for anonymous session tracking
 *   - outcome tracks the deflection result for analytics
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators ────────────────────────────────────────────────────────

export const deflectionOutcomeValidator = v.union(
  v.literal("helpful"),
  v.literal("notHelpful"),
  v.literal("escalated"),
  v.literal("abandoned"),
);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const supportTables = {
  /**
   * support_deflectionLogs - AI deflection interaction records
   *
   * Records each time a user queries the support widget and receives an
   * AI-generated or KB-sourced answer. Tracks outcomes for deflection
   * rate analytics and content gap analysis.
   *
   * kbArticleIds stores article IDs as plain strings (not Convex Id types)
   * to maintain schema independence from the KB system.
   *
   * ticketId stores the ticket ID as a plain string to maintain schema
   * independence from the Ticket system.
   */
  support_deflectionLogs: defineTable({
    // ── Session Context ──────────────────────────────────────────────────────
    sessionId: v.string(),
    userId: v.optional(v.id("users")),

    // ── Query & Response ─────────────────────────────────────────────────────
    query: v.string(),
    aiResponse: v.string(),

    // ── Source Articles ──────────────────────────────────────────────────────
    /** Plain string IDs for schema independence from KB system */
    kbArticleIds: v.array(v.string()),

    // ── Outcome ──────────────────────────────────────────────────────────────
    outcome: deflectionOutcomeValidator,

    // ── Escalation Context ───────────────────────────────────────────────────
    /** Plain string ticket ID for schema independence from Ticket system */
    ticketId: v.optional(v.string()),

    // ── Performance Metrics ──────────────────────────────────────────────────
    responseLatencyMs: v.number(),
    tokensUsed: v.optional(v.number()),

    // ── Timestamp ────────────────────────────────────────────────────────────
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_outcome", ["outcome"])
    .index("by_date", ["createdAt"])
    .index("by_ticket", ["ticketId"]),

  // Wave 13: Support Integration System — inbound channel adapters.

  /**
   * support_channels — configured inbound channels. One row per
   * channel instance (one Postmark mailbox, one Slack workspace, etc.).
   */
  support_channels: defineTable({
    code: v.string(),
    kind: v.union(
      v.literal("email"),
      v.literal("slack"),
      v.literal("discord"),
      v.literal("twilio_sms"),
      v.literal("form"),
      v.literal("chat"),
      v.literal("api"),
    ),
    label: v.string(),
    isActive: v.boolean(),
    config: v.optional(v.any()),
    webhookUrl: v.optional(v.string()),
    lastInboundAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_kind", ["kind"])
    .index("by_active", ["isActive"]),

  /**
   * support_inbound_events — every raw inbound payload from a channel,
   * with idempotency via (channelId, externalId). Maps to a ticket once
   * parsed.
   */
  support_inbound_events: defineTable({
    channelId: v.id("support_channels"),
    externalId: v.string(),
    rawPayload: v.string(),
    parsedPayload: v.optional(v.any()),
    ticketId: v.optional(v.string()),
    status: v.union(
      v.literal("received"),
      v.literal("parsed"),
      v.literal("ticket_created"),
      v.literal("ticket_updated"),
      v.literal("error"),
    ),
    errorMessage: v.optional(v.string()),
    receivedAt: v.number(),
  })
    .index("by_channel_external_id", ["channelId", "externalId"])
    .index("by_status", ["status"])
    .index("by_ticket", ["ticketId"])
    .index("by_received_at", ["receivedAt"]),
};
