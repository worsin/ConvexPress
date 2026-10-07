/**
 * Settings System - Schema
 *
 * One table storing site-wide configuration in a section-based design.
 * Each section (general, reading, writing, discussion, permalinks, privacy)
 * is stored as a single document with a `values` field containing the
 * section-specific settings.
 *
 * This mirrors WordPress's `wp_options` table but with structured,
 * typed documents instead of flat key-value rows. Section-level
 * validation is enforced in mutation handlers, not in the schema
 * (the `values` field uses `v.any()` intentionally).
 *
 * The `by_section` index enables O(1) lookup per section. Since each
 * section has exactly one document, queries always use `.unique()`.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const settingsTables = {
  /** Immutable source records retained after retiring the legacy appearance tables.
   * Recovery/export only: these are never read as active Website configuration. */
  legacyAppearanceArchives: defineTable({
    sourceTable: v.union(v.literal("themes"), v.literal("layouts")),
    sourceId: v.string(),
    snapshot: v.any(),
    archivedAt: v.number(),
  }).index("by_source", ["sourceTable", "sourceId"]),
  /** Private, recoverable Customizer overrides; never projected to visitors. */
  appearance_drafts: defineTable({
    userId: v.id("users"),
    packId: v.string(),
    sourceRevision: v.string(),
    values: v.any(),
    variants: v.record(v.string(), v.string()),
    updatedAt: v.number(),
  }).index("by_user_pack", ["userId", "packId"]),
  settings: defineTable({
    /** Which settings section this document represents */
    section: v.union(
      v.literal("general"),
      v.literal("reading"),
      v.literal("writing"),
      v.literal("discussion"),
      v.literal("permalinks"),
      v.literal("privacy"),
      v.literal("email"),
      v.literal("media"),
      v.literal("analytics"),
      v.literal("ai"),
      v.literal("blocks"),
      v.literal("plugins"),
  v.literal("membership.general"),
      v.literal("search"),
      // Knowledge Base System sections
      v.literal("kb.general"),
      v.literal("kb.features"),
      v.literal("kb.search"),
      // Ticket System sections
      v.literal("ticket.general"),
      v.literal("ticket.sla"),
      // Support Bridge System sections
      v.literal("support.widget"),
      v.literal("support.ai"),
      // Website Appearance sections
      v.literal("layout"),
      v.literal("header"),
      v.literal("footer"),
      // Commerce & Shipping sections
      v.literal("commerce.general"),
      v.literal("commerce.payments"),
      v.literal("commerce.assistant"),
      v.literal("commerce.layout"),
      v.literal("appearance.template"),
      v.literal("brand"),
      v.literal("commerce.subscriptions.counters"),
      v.literal("integrations.shipping"),
      v.literal("integrations.shipping.shipstation"),
      v.literal("integrations.shipping.ups"),
      v.literal("integrations.shipping.usps"),
      v.literal("integrations.shipping.fedex"),
      v.literal("integrations.shipping.dhl"),
      v.literal("integrations.clerk"),
      v.literal("integrations.google"),
      v.literal("dashboard"),
      v.literal("analytics.ga4"),
    ),

    /**
     * The actual settings values for this section.
     * Typed per-section via validators in mutation handlers.
     * Uses v.any() because each section has a different shape.
     */
    values: v.any(),

    /** Independent of values so resetting a template cannot revive legacy appearance. */
    legacyAppearanceMigration: v.optional(v.object({ version: v.number(), migratedAt: v.number() })),

    /** Unix timestamp (ms) of last update */
    updatedAt: v.number(),

    /** Reference to the user who last updated this section */
    updatedBy: v.id("users"),
  }).index("by_section", ["section"]),
};
