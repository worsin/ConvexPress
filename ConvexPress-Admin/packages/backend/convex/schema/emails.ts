/**
 * Email Notification System - Schema
 *
 * Three tables powering the transactional email infrastructure:
 *
 *   - emailTemplates: 25 pre-defined email notification templates with
 *     customizable subject/body, variable definitions, and delivery config.
 *
 *   - emailQueue: Persistent email queue with full delivery tracking,
 *     retry logic, and Resend API integration.
 *
 *   - emailUnsubscribes: Per-user, per-category email opt-out preferences.
 *
 * ConvexPress replaces WordPress's fire-and-forget `wp_mail()` with a
 * persistent queue backed by Convex. Every email is stored, tracked,
 * and retryable. Delivery status is visible in the admin panel.
 *
 * Owned by the Email Notification System.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Value Types ──────────────────────────────────────────────────────

const emailPriority = v.union(
  v.literal("immediate"),
  v.literal("batched"),
  v.literal("digest"),
);

const emailRecipientType = v.union(
  v.literal("customer"),
  v.literal("employee"),
  v.literal("admin"),
  v.literal("custom"),
);

const emailStatus = v.union(
  v.literal("queued"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("failed"),
  v.literal("cancelled"),
);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const emailTables = {
  // ─── Email Templates ─────────────────────────────────────────────────────
  emailTemplates: defineTable({
    // --- Identity ---
    /** Unique template identifier (e.g., "welcome-email") */
    slug: v.string(),
    /** Human-readable name (e.g., "Welcome Email") */
    name: v.string(),
    /** What this email is for */
    description: v.optional(v.string()),

    // --- Content ---
    /** Subject with variables: "Welcome to {site_name}!" */
    subjectTemplate: v.string(),
    /** HTML body template */
    bodyHtml: v.string(),
    /** Plain-text fallback (auto-generated if not set) */
    bodyText: v.optional(v.string()),
    /** Email preheader/preview text */
    preheaderText: v.optional(v.string()),

    // --- Variables ---
    /** Variables available in this template */
    availableVariables: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        required: v.boolean(),
        defaultValue: v.optional(v.string()),
      }),
    ),

    // --- Delivery Configuration ---
    /** Delivery priority: immediate, batched, or digest */
    priority: emailPriority,
    /** Who receives this email: customer, employee, admin, custom */
    recipientType: emailRecipientType,
    /** Whether this template is enabled */
    isActive: v.boolean(),
    /** Event that triggers this email (undefined for digest-only templates) */
    eventCode: v.optional(v.string()),

    // --- Customization ---
    /** Whether admin has modified the default template */
    isCustomized: v.boolean(),
    /** Original subject (for "Reset to Default") */
    defaultSubjectTemplate: v.string(),
    /** Original body HTML (for "Reset to Default") */
    defaultBodyHtml: v.string(),

    // --- Metadata ---
    /** Template category: registration, content, comment, security, system */
    category: v.string(),
    /** When this template was last used */
    lastSentAt: v.optional(v.number()),
    /** Lifetime send count */
    totalSent: v.number(),

    // --- Airtable Sync ---
    /** Airtable record ID for sync tracking */
    airtableRecordId: v.optional(v.string()),
    /** Timestamp of last Airtable sync */
    syncedAt: v.optional(v.number()),

    // --- Timestamps ---
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_event_code", ["eventCode", "isActive"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .index("by_airtable_id", ["airtableRecordId"]),

  // ─── Email Queue ─────────────────────────────────────────────────────────
  emailQueue: defineTable({
    // --- Recipient ---
    /** Recipient email address */
    to: v.string(),
    /** Recipient display name */
    toName: v.optional(v.string()),
    /** User identifier (if known) */
    toUserId: v.optional(v.string()),

    // --- Sender ---
    /** From email address (from settings) */
    from: v.string(),
    /** From display name (from settings) */
    fromName: v.string(),
    /** Reply-to address (if different from "from") */
    replyTo: v.optional(v.string()),

    // --- Content ---
    /** Rendered subject (variables replaced) */
    subject: v.string(),
    /** Rendered HTML body */
    bodyHtml: v.string(),
    /** Rendered plain-text body */
    bodyText: v.optional(v.string()),

    // --- Template Reference ---
    /** Which template was used */
    templateSlug: v.string(),
    /** JSON: variables used to render this email */
    templateVariables: v.string(),

    // --- Delivery ---
    /** Current delivery status */
    status: emailStatus,
    /** Delivery priority */
    priority: emailPriority,
    /** When to send (for batched/digest emails) */
    scheduledFor: v.optional(v.number()),

    // --- Resend Integration ---
    /** Resend message ID (after send) */
    resendId: v.optional(v.string()),
    /** JSON: full Resend API response */
    resendResponse: v.optional(v.string()),

    // --- Retry ---
    /** Number of send attempts */
    attempts: v.number(),
    /** Maximum retry attempts (default 3) */
    maxAttempts: v.number(),
    /** When last attempt occurred */
    lastAttemptAt: v.optional(v.number()),
    /** When to retry (if retrying) */
    nextRetryAt: v.optional(v.number()),
    /** Error message from last failed attempt */
    lastError: v.optional(v.string()),

    // --- Tracking ---
    /** Event that triggered this email */
    eventId: v.optional(v.id("events")),
    /** For linking related emails (e.g., bulk sends) */
    correlationId: v.optional(v.string()),

    // --- Timestamps ---
    /** When queued */
    createdAt: v.number(),
    /** When successfully sent */
    sentAt: v.optional(v.number()),
    /** When confirmed delivered */
    deliveredAt: v.optional(v.number()),
    /** When recipient opened (if tracked) */
    openedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_status_scheduled", ["status", "scheduledFor"])
    .index("by_template", ["templateSlug", "createdAt"])
    .index("by_recipient", ["to", "createdAt"])
    .index("by_recipient_user", ["toUserId", "createdAt"])
    .index("by_resend_id", ["resendId"])
    .index("by_event", ["eventId"])
    .index("by_created", ["createdAt"])
    .index("by_retry", ["status", "nextRetryAt"]),

  // ─── Email Unsubscribes ──────────────────────────────────────────────────
  emailUnsubscribes: defineTable({
    /** User identifier */
    userId: v.string(),
    /** Email category to unsubscribe from */
    category: v.string(),
    /** When the user opted out */
    unsubscribedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_category", ["userId", "category"]),
};
