/**
 * Ticket System - Schema
 *
 * Six tables supporting a full support ticket lifecycle:
 *   - `ticket_tickets`          - Primary ticket storage with sequential numbering
 *   - `ticket_messages`         - Threaded messages per ticket with sequence ordering
 *   - `ticket_counters`         - Atomic counters for sequential ticket number generation
 *   - `ticket_cannedResponses`  - Admin canned response templates with variable substitution
 *   - `ticket_sessions`         - Anonymous session tracking for unauthenticated widget users
 *   - `ticket_rateLimits`       - Rate limiting records for AI queries, ticket creation, search
 *
 * Key design decisions:
 *   - ticketNumber is a formatted string "TKT-YYYYMM-XXXXX" for human readability
 *   - User email/name are snapshotted at creation time (not live-resolved)
 *   - Messages use sequence numbers (not timestamps) for guaranteed ordering
 *   - Internal notes are messages with isInternal=true, filtered from user queries
 *   - kbArticlesShown stores article IDs as strings (not Id<"kb_articles">) for
 *     schema independence -- the ticket system works without the KB system
 *   - Attachments reference Convex _storage for file uploads
 *   - Sessions have 24hr TTL with cleanup via cron
 *   - Rate limits are per-session per-action with configurable windows
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const ticketCategoryValidator = v.union(
  v.literal("billing"),
  v.literal("technical"),
  v.literal("account"),
  v.literal("featureRequest"),
  v.literal("general"),
  v.literal("other"),
);

export const ticketStatusValidator = v.union(
  v.literal("open"),
  v.literal("awaitingResponse"),
  v.literal("inProgress"),
  v.literal("resolved"),
  v.literal("closed"),
);

export const ticketPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const ticketSourceValidator = v.union(
  v.literal("widget"),
  v.literal("email"),
  v.literal("dashboard"),
  v.literal("api"),
);

export const messageSenderTypeValidator = v.union(
  v.literal("user"),
  v.literal("admin"),
  v.literal("system"),
  v.literal("ai"),
);

export const rateLimitActionValidator = v.union(
  v.literal("aiQuery"),
  v.literal("ticketCreate"),
  v.literal("search"),
);

export const attachmentValidator = v.object({
  name: v.string(),
  storageId: v.id("_storage"),
  mimeType: v.string(),
  size: v.number(),
});

// ─── Tables ─────────────────────────────────────────────────────────────────

export const ticketTables = {
  /**
   * ticket_tickets - Primary ticket storage
   *
   * Each ticket has a human-readable sequential number (TKT-YYYYMM-XXXXX),
   * a snapshot of the user's email/name at creation time, and full lifecycle
   * tracking fields for status transitions, assignment, SLA, and CSAT.
   *
   * The kbArticlesShown field stores article IDs as plain strings rather than
   * Id<"kb_articles"> to maintain schema independence from the KB system.
   */
  ticket_tickets: defineTable({
    // ── Identification ────────────────────────────────────────────────────
    ticketNumber: v.string(), // "TKT-YYYYMM-XXXXX"

    // ── User Context (snapshotted at creation) ────────────────────────────
    userId: v.id("users"),
    userEmailSnapshot: v.string(),
    userNameSnapshot: v.string(),

    // ── Content ───────────────────────────────────────────────────────────
    subject: v.string(),
    description: v.string(),
    category: ticketCategoryValidator,

    // ── Status & Priority ─────────────────────────────────────────────────
    status: ticketStatusValidator,
    priority: ticketPriorityValidator,

    // ── Assignment ────────────────────────────────────────────────────────
    assignedTo: v.optional(v.id("users")),
    assignedAt: v.optional(v.number()),

    // ── Source ─────────────────────────────────────────────────────────────
    source: ticketSourceValidator,

    // ── Tags ──────────────────────────────────────────────────────────────
    tags: v.array(v.string()),

    // ── AI Deflection Context ─────────────────────────────────────────────
    aiAttempted: v.boolean(),
    aiQuery: v.optional(v.string()),
    aiResponse: v.optional(v.string()),
    kbArticlesShown: v.optional(v.array(v.string())), // String IDs for schema independence

    // ── CSAT Rating ───────────────────────────────────────────────────────
    rating: v.optional(v.number()), // 1-5
    ratingComment: v.optional(v.string()),

    // ── Denormalized Counts ───────────────────────────────────────────────
    messageCount: v.number(),

    // ── Lifecycle Timestamps ──────────────────────────────────────────────
    lastMessageAt: v.optional(v.number()),
    firstResponseAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_assigned", ["assignedTo"])
    .index("by_category", ["category"])
    .index("by_ticket_number", ["ticketNumber"])
    .index("by_status_priority", ["status", "priority"])
    .index("by_assigned_status", ["assignedTo", "status", "priority"])
    .index("by_status_priority_created", ["status", "priority", "createdAt"])
    .index("by_created", ["createdAt"])
    .index("by_first_response", ["firstResponseAt", "status"])
    .index("by_last_message", ["lastMessageAt"]),

  /**
   * ticket_messages - Threaded messages per ticket
   *
   * Messages use sequence numbers (not timestamps) for guaranteed ordering.
   * This avoids timestamp collision issues in real-time systems.
   *
   * Internal notes (isInternal=true) are hidden from ticket owners and
   * only visible to users with ticket.viewInternalNotes capability.
   *
   * Attachments reference Convex _storage for secure file access.
   */
  ticket_messages: defineTable({
    // ── Identification ────────────────────────────────────────────────────
    ticketId: v.id("ticket_tickets"),
    sequence: v.number(), // Guaranteed ordering within a ticket

    // ── Sender ────────────────────────────────────────────────────────────
    senderType: messageSenderTypeValidator,
    senderId: v.optional(v.id("users")),
    senderName: v.string(),
    senderEmail: v.optional(v.string()),

    // ── Content ───────────────────────────────────────────────────────────
    content: v.string(), // Markdown
    isInternal: v.boolean(), // Hidden from ticket owner

    // ── Attachments ───────────────────────────────────────────────────────
    attachments: v.optional(v.array(attachmentValidator)),

    // ── Timestamps ────────────────────────────────────────────────────────
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_ticket_time", ["ticketId", "createdAt"])
    .index("by_ticket_sequence", ["ticketId", "sequence"])
    .index("by_sender", ["senderId"]),

  /**
   * ticket_counters - Atomic counters for sequential ticket numbering
   *
   * One document per year-month pair. The counter field is atomically
   * incremented when a new ticket is created. This guarantees unique,
   * monotonically increasing ticket numbers within each month.
   *
   * Format: TKT-{YYYYMM}-{counter padded to 5 digits}
   * Example: TKT-202604-00001
   */
  ticket_counters: defineTable({
    year: v.number(),
    month: v.number(),
    counter: v.number(),
  }).index("by_year_month", ["year", "month"]),

  /**
   * ticket_cannedResponses - Admin canned response templates
   *
   * Templates support {{variable}} substitution for common fields:
   *   - {{userName}} - Ticket owner's display name
   *   - {{ticketNumber}} - The ticket number string
   *   - {{category}} - Ticket category label
   *
   * Admin types a shortcut (e.g., "/refund") in the reply box to insert
   * the template content. Usage count is incremented for analytics.
   */
  ticket_cannedResponses: defineTable({
    title: v.string(),
    shortcut: v.string(), // e.g., "/refund"
    content: v.string(), // Supports {{variable}} substitution
    category: v.string(),
    usageCount: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shortcut", ["shortcut"])
    .index("by_category", ["category"]),

  /**
   * ticket_sessions - Anonymous session tracking
   *
   * For the floating support widget, users may interact before authenticating.
   * Sessions track anonymous activity and can be associated with a user once
   * they log in. 24-hour TTL, cleaned up by cron.
   */
  ticket_sessions: defineTable({
    sessionId: v.string(), // Crypto-random string
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    expiresAt: v.number(), // 24hr TTL
    lastActivityAt: v.number(),
  })
    .index("by_session_id", ["sessionId"])
    .index("by_expires", ["expiresAt"])
    .index("by_user", ["userId"]),

  /**
   * ticket_rateLimits - Rate limiting records
   *
   * Per-session, per-action rate limiting for:
   *   - aiQuery: AI deflection queries (prevent abuse)
   *   - ticketCreate: Ticket creation (prevent spam)
   *   - search: Search queries (prevent abuse)
   *
   * Records are cleaned up periodically by cron.
   */
  ticket_rateLimits: defineTable({
    sessionId: v.string(),
    action: rateLimitActionValidator,
    userId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session_action", ["sessionId", "action"])
    .index("by_action_time", ["action", "createdAt"])
    .index("by_created", ["createdAt"]),
};
