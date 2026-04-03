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
};
