/**
 * ConvexPress Forms — extension schema (v2 Layer 1)
 *
 * The first real v2 scanner-discovered extension. The codegen script
 * `scripts/generate-extension-index.mjs` imports the `tables` export below
 * and merges it into the schema hub. We do NOT edit convex/schema.ts.
 *
 * FIELD MODEL — reused from the Custom Field System (customFields), NOT rebuilt:
 *   - A Form's fields are `fieldDefinitions` attached to a backing `fieldGroup`
 *     (forms.fieldGroupId -> fieldGroups._id).
 *   - A submission's answers are `fieldValues` with entityType="form_submission"
 *     and entityId=<form_submissions._id>. No parallel value store.
 *
 * This file grows per phase. Phase 1 owns the core: forms + submissions + notes.
 * Later phases append: form_notifications, form_confirmations, form_actions,
 * form_action_runs, form_funnel_stats, form_submission_attempts, form_security_settings.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const tables = {
  // ── Form definitions (Form Builder System) ─────────────────────────────
  forms: defineTable({
    title: v.string(),
    slug: v.string(), // unique, public; used at /forms/$slug
    description: v.optional(v.string()),

    // Soft-delete via status union (kit convention), not an isDeleted boolean.
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),

    // Fields reuse the customFields engine via a backing field group.
    fieldGroupId: v.optional(v.id("fieldGroups")),

    // Form-level settings as JSON (scheduling window, entry limit,
    // require-login, default confirmation/notification refs, etc.).
    settings: v.string(), // JSON-encoded

    publishedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"]),

  // ── Submissions / entries (Form Submission System) ──────────────────────
  // Answers live in customFields `fieldValues` (entityType="form_submission").
  form_submissions: defineTable({
    formId: v.id("forms"),

    status: v.union(
      v.literal("partial"), // save-and-continue draft, not yet completed
      v.literal("complete"),
      v.literal("spam"),
      v.literal("deleted"), // soft-delete
    ),

    submittedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),

    // Server-derived request metadata (never trusted from the client).
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    userId: v.optional(v.id("users")), // set when a logged-in user submits

    // Save-and-continue (Multi-Step System).
    resumeToken: v.optional(v.string()),
    currentStep: v.optional(v.number()),

    // Admin entry-ops flags (Entry Management System). Optional so this
    // additive extension field is safe for rows written before the inbox
    // shipped; query projections normalize missing values to false.
    read: v.optional(v.boolean()),
    starred: v.optional(v.boolean()),

    // Free-form meta bag for additive cross-system data (e.g. analytics
    // abandon marker) without re-migrating this table.
    meta: v.optional(v.string()), // JSON-encoded

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_form", ["formId"])
    .index("by_form_status", ["formId", "status"])
    .index("by_form_read", ["formId", "read"])
    .index("by_form_starred", ["formId", "starred"])
    .index("by_status", ["status"])
    .index("by_resumeToken", ["resumeToken"]),

  // ── Entry notes (Entry Management System) ───────────────────────────────
  form_submission_notes: defineTable({
    submissionId: v.id("form_submissions"),
    body: v.string(),
    authorId: v.id("users"),
    createdAt: v.number(),
  }).index("by_submission", ["submissionId"]),

  // -- Order records (Form Order Form Commerce System) ---------------------
  // The form owns its respondent/order workflow, while Purchase Core owns the
  // cross-channel payment ledger. This table links the two without reusing
  // storefront commerce_orders for non-cart purchases.
  form_orders: defineTable({
    formId: v.id("forms"),
    submissionId: v.id("form_submissions"),
    purchaseOrderId: v.optional(v.id("purchase_orders")),
    status: v.union(
      v.literal("pending_payment"),
      v.literal("paid"),
      v.literal("payment_failed"),
      v.literal("cancelled"),
      v.literal("partially_refunded"),
      v.literal("refunded"),
    ),
    currencyCode: v.string(),
    subtotalAmount: v.number(),
    discountAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    totalAmount: v.number(),
    amountPaid: v.number(),
    amountRefunded: v.number(),
    paymentProvider: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    // Server-derived pricing line snapshot; shape can evolve with field types.
    lineItems: v.optional(v.any()),
    // Provider/source details that must not force schema churn for add-ons.
    metadata: v.optional(v.any()),
    paidAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_form", ["formId"])
    .index("by_submission", ["submissionId"])
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_status", ["status"])
    .index("by_payment_intent", ["paymentIntentId"])
    .index("by_createdAt", ["createdAt"]),

  // ── Notifications config (Form Notification System) ─────────────────────
  form_notifications: defineTable({
    formId: v.id("forms"),
    name: v.string(),
    channel: v.union(v.literal("email"), v.literal("site")),
    recipientType: v.union(v.literal("admin"), v.literal("customer")),
    toExpression: v.optional(v.string()), // merge tag resolving the respondent email
    subjectTemplate: v.optional(v.string()),
    messageTemplate: v.optional(v.string()),
    triggerEventCode: v.string(), // e.g. "form.submitted"
    conditionalLogic: v.optional(v.string()),
    enabled: v.boolean(),
    order: v.number(),
  })
    .index("by_form", ["formId"])
    .index("by_form_event", ["formId", "triggerEventCode"]),

  // ── Confirmations config (Form Confirmation System) ─────────────────────
  form_confirmations: defineTable({
    formId: v.id("forms"),
    name: v.string(),
    type: v.union(v.literal("message"), v.literal("redirect"), v.literal("page")),
    content: v.optional(v.string()),
    redirectUrl: v.optional(v.string()),
    pageId: v.optional(v.string()),
    conditionalLogic: v.optional(v.string()),
    isDefault: v.boolean(),
    order: v.number(),
    // Audit fields (added by the Form Confirmation System build).
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_form", ["formId"])
    .index("by_form_order", ["formId", "order"])
    .index("by_form_default", ["formId", "isDefault"]),

  // ── Actions / feeds (Form Actions & Feeds System) ───────────────────────
  // The original 7 fields ({ formId, type, label, config, conditionalLogic,
  // enabled, order }) are UNCHANGED. Two read indexes are added additively for
  // the runner (enabled-actions load + ordered iteration); `by_form` is kept.
  form_actions: defineTable({
    formId: v.id("forms"),
    type: v.string(), // subscription | account | payment | webhook | lead_capture | email_marketing
    label: v.string(),
    config: v.string(), // JSON
    conditionalLogic: v.optional(v.string()),
    enabled: v.boolean(),
    order: v.number(),
  })
    .index("by_form", ["formId"])
    .index("by_form_enabled", ["formId", "enabled"])
    .index("by_form_order", ["formId", "order"]),

  // The original 9 fields are UNCHANGED. `formId` + `nextAttemptAt` are added as
  // v.optional (existing rows stay valid) — both are load-bearing for the runner
  // (retry timing) and the admin run-history view. `status` union keeps
  // `awaiting_payment` (paid-subscription non-terminal outcome — webhook-owned).
  // Skips are recorded as terminal `completed` rows tagged in `result` JSON
  // (`{ "skipped": true, ... }`), so NO `skipped` status is added.
  form_action_runs: defineTable({
    submissionId: v.id("form_submissions"),
    formActionId: v.id("form_actions"),
    type: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("awaiting_payment"), // paid subscription: activation is webhook-owned
    ),
    attempts: v.number(),
    error: v.optional(v.string()),
    result: v.optional(v.string()), // JSON
    // Additive (optional): denormalized form id for the admin run-history view,
    // and the next scheduled retry timestamp for the capped-backoff runner.
    formId: v.optional(v.id("forms")),
    nextAttemptAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_submission", ["submissionId"])
    .index("by_submission_action", ["submissionId", "formActionId"])
    .index("by_form_status", ["formId", "status"])
    .index("by_status", ["status"]),

  // ── Funnel analytics (Form Analytics & Export System) ───────────────────
  form_funnel_stats: defineTable({
    formId: v.id("forms"),
    day: v.string(), // YYYY-MM-DD bucket
    stage: v.union(
      v.literal("viewed"),
      v.literal("started"),
      v.literal("completed"),
      v.literal("abandoned"),
    ),
    count: v.number(),
  }).index("by_form_day", ["formId", "day", "stage"]),

  // ── Public funnel write guard (Analytics abuse protection) ─────────────
  // One short-retention row per ACCEPTED public `viewed`/`started` write. This
  // keeps the public analytics mutation cheap to clamp by per-form/stage minute
  // and lets `started` dedupe by sessionNonce/day without storing IP addresses
  // or respondent PII.
  form_funnel_public_events: defineTable({
    formId: v.id("forms"),
    day: v.string(), // YYYY-MM-DD bucket
    stage: v.union(v.literal("viewed"), v.literal("started")),
    sessionNonce: v.optional(v.string()),
    windowStart: v.number(),
    createdAt: v.number(),
  })
    .index("by_form_stage_day_nonce", [
      "formId",
      "stage",
      "day",
      "sessionNonce",
    ])
    .index("by_form_stage_window", ["formId", "stage", "windowStart"])
    .index("by_createdAt", ["createdAt"]),

  // ── Spam / rate limiting (Form Spam & Submission Security System) ────────
  // The ORIGINAL 4 fields ({ ip, formId, windowStart, count }) and the
  // `by_ip_form` index are UNCHANGED. Two read indexes added for the per-form
  // ceiling + the retention sweep; two optional counters added for admin insight.
  form_submission_attempts: defineTable({
    ip: v.string(),
    formId: v.id("forms"),
    windowStart: v.number(),
    count: v.number(),
    // Optional admin-insight counters (additive; not required by the guard).
    blockedCount: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
  })
    .index("by_ip_form", ["ip", "formId"])
    .index("by_form_window", ["formId", "windowStart"])
    .index("by_windowStart", ["windowStart"]),

  // The ORIGINAL 5 fields (key, captchaProvider, captchaSiteKey,
  // rateLimitPerMinute, honeypotEnabled) are UNCHANGED. Everything below is
  // appended as v.optional and defaulted in `loadSecuritySettings` so the guard
  // is effective even when the singleton is unseeded. NO secret key is ever
  // stored here — CAPTCHA secrets are ENV-only (FORMS_<PROVIDER>_SECRET_KEY).
  form_security_settings: defineTable({
    key: v.string(), // singleton "global"
    captchaProvider: v.optional(
      v.union(
        v.literal("turnstile"),
        v.literal("hcaptcha"),
        v.literal("recaptcha"),
        v.literal("none"),
      ),
    ),
    captchaSiteKey: v.optional(v.string()),
    rateLimitPerMinute: v.optional(v.number()),
    honeypotEnabled: v.boolean(),
    // ── Additive security thresholds/toggles (all optional, defaulted) ──
    captchaEnabled: v.optional(v.boolean()),
    recaptchaMinScore: v.optional(v.number()),
    honeypotFieldName: v.optional(v.string()),
    minFillMs: v.optional(v.number()),
    maxFormAgeMs: v.optional(v.number()),
    rateLimitEnabled: v.optional(v.boolean()),
    windowMs: v.optional(v.number()),
    perIpPerFormLimit: v.optional(v.number()),
    perFormLimit: v.optional(v.number()),
    attemptRetentionMs: v.optional(v.number()),
    failClosed: v.optional(v.boolean()),
    skipForLoggedIn: v.optional(v.boolean()),
    updatedBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  }).index("by_key", ["key"]),
};
