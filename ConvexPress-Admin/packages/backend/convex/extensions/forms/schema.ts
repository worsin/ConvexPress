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

    // Admin entry-ops flags (Entry Management System).
    read: v.boolean(),
    starred: v.boolean(),

    // Free-form meta bag for additive cross-system data (e.g. analytics
    // abandon marker) without re-migrating this table.
    meta: v.optional(v.string()), // JSON-encoded

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_form", ["formId"])
    .index("by_form_status", ["formId", "status"])
    .index("by_status", ["status"])
    .index("by_resumeToken", ["resumeToken"]),

  // ── Entry notes (Entry Management System) ───────────────────────────────
  form_submission_notes: defineTable({
    submissionId: v.id("form_submissions"),
    body: v.string(),
    authorId: v.id("users"),
    createdAt: v.number(),
  }).index("by_submission", ["submissionId"]),
};
