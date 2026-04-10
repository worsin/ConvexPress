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
  /**
   * Encrypted secret storage for service API keys.
   *
   * Stores API keys (AI provider, Tavily, Meilisearch, Resend, etc.)
   * encrypted with AES-256-GCM. Each service is identified by a
   * dotted key (e.g. "ai.openrouter", "ai.tavily", "search.meilisearch").
   *
   * Only internal queries can decrypt; client queries can only check
   * existence via hasServiceSecret.
   */
  service_secrets: defineTable({
    /** Dotted service identifier, e.g. "ai.openrouter", "search.meilisearch" */
    service: v.string(),
    /** AES-256-GCM encrypted payload in "iv:authTag:ciphertext" format */
    encryptedPayload: v.string(),
    /** Monotonically increasing version for rotation tracking */
    version: v.number(),
    /** Unix timestamp (ms) of last update */
    updatedAt: v.number(),
    /** User who last updated this secret */
    updatedBy: v.optional(v.id("users")),
  }).index("by_service", ["service"]),

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
      v.literal("plugins"),
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
    ),

    /**
     * The actual settings values for this section.
     * Typed per-section via validators in mutation handlers.
     * Uses v.any() because each section has a different shape.
     */
    values: v.any(),

    /** Unix timestamp (ms) of last update */
    updatedAt: v.number(),

    /** Reference to the user who last updated this section */
    updatedBy: v.id("users"),
  }).index("by_section", ["section"]),
};
