/**
 * Knowledge Base System - Settings Functions
 *
 * KB-specific settings stored in the global settings table using the
 * section-based approach. Three sections:
 *
 *   kb.general  - Site name, description, homepage layout, articles per page
 *   kb.features - Feature toggles (comments, bookmarks, progress, ratings, related)
 *   kb.search   - Meilisearch and RAG (AI search) configuration
 *
 * Uses the Settings System's updateSection mutation and getBySection query
 * via direct DB access (same pattern as the core settings system internals).
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SYSTEM } from "../events/constants";
import {
  getDefaults,
  KB_GENERAL_DEFAULTS,
  KB_FEATURES_DEFAULTS,
  KB_SEARCH_DEFAULTS,
} from "../settings/defaults";
import { computeChanges } from "../settings/helpers";

// ─── getKbSettings ───────────────────────────────────────────────────────────

/**
 * Get all KB settings, merged with defaults.
 *
 * Returns an object with three sections:
 *   - general: { siteName, siteDescription, homepageLayout, articlesPerPage }
 *   - features: { commentsEnabled, bookmarksEnabled, progressTrackingEnabled,
 *                 ratingsEnabled, relatedArticlesEnabled }
 *   - search: { meilisearchEnabled, meilisearchUrl, meilisearchApiKey,
 *               ragEnabled, ragProvider, ragApiKey, ragModel }
 *
 * @auth manage_options (Administrator only)
 */
export const getKbSettings = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserCan(ctx, "manage_options");
    if (!user) return null;

    // Load all three KB sections, merging stored values with defaults
    const sections = ["kb.general", "kb.features", "kb.search"] as const;
    const result: Record<string, Record<string, unknown>> = {};

    for (const section of sections) {
      const defaults = getDefaults(section);
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", section))
        .unique();

      result[section] = doc
        ? { ...defaults, ...(doc.values as Record<string, unknown>) }
        : { ...defaults };
    }

    const search = result["kb.search"] as Record<string, unknown>;

    // Mask API keys before returning to the client
    if (search.meilisearchApiKey && typeof search.meilisearchApiKey === "string") {
      const key = search.meilisearchApiKey;
      search.meilisearchApiKey = key.length > 8
        ? key.slice(0, 4) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-4)
        : "••••••••";
    }
    if (search.ragApiKey && typeof search.ragApiKey === "string") {
      const key = search.ragApiKey;
      search.ragApiKey = key.length > 8
        ? key.slice(0, 4) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-4)
        : "••••••••";
    }

    return {
      general: result["kb.general"] as typeof KB_GENERAL_DEFAULTS,
      features: result["kb.features"] as typeof KB_FEATURES_DEFAULTS,
      search: search as typeof KB_SEARCH_DEFAULTS,
    };
  },
});

// ─── updateKbSettings ────────────────────────────────────────────────────────

/**
 * Update KB settings. Administrator only.
 *
 * All three sections can be updated in a single call by passing the
 * corresponding argument. Omitted sections are left unchanged.
 *
 * @auth manage_options (Administrator only)
 */
export const updateKbSettings = mutation({
  args: {
    general: v.optional(
      v.object({
        siteName: v.optional(v.string()),
        siteDescription: v.optional(v.string()),
        homepageLayout: v.optional(
          v.union(
            v.literal("categories"),
            v.literal("search"),
            v.literal("featured"),
          ),
        ),
        articlesPerPage: v.optional(v.number()),
      }),
    ),
    features: v.optional(
      v.object({
        commentsEnabled: v.optional(v.boolean()),
        bookmarksEnabled: v.optional(v.boolean()),
        progressTrackingEnabled: v.optional(v.boolean()),
        ratingsEnabled: v.optional(v.boolean()),
        relatedArticlesEnabled: v.optional(v.boolean()),
      }),
    ),
    search: v.optional(
      v.object({
        meilisearchEnabled: v.optional(v.boolean()),
        meilisearchUrl: v.optional(v.string()),
        meilisearchApiKey: v.optional(v.string()),
        ragEnabled: v.optional(v.boolean()),
        ragProvider: v.optional(
          v.union(v.literal("openai"), v.literal("anthropic")),
        ),
        ragApiKey: v.optional(v.string()),
        ragModel: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    const now = Date.now();
    const updatedSections: string[] = [];

    // ── kb.general ──────────────────────────────────────────────────────────
    if (args.general !== undefined) {
      const defaults = getDefaults("kb.general");

      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "kb.general"))
        .unique();

      const oldValues: Record<string, unknown> = existingDoc
        ? { ...defaults, ...(existingDoc.values as Record<string, unknown>) }
        : { ...defaults };

      const newValues: Record<string, unknown> = {
        ...oldValues,
        ...Object.fromEntries(
          Object.entries(args.general).filter(([, v]) => v !== undefined),
        ),
      };

      const changes = computeChanges(oldValues, newValues);

      if (changes.length > 0) {
        if (existingDoc) {
          await ctx.db.patch(existingDoc._id, {
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        } else {
          await ctx.db.insert("settings", {
            section: "kb.general",
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        }
        updatedSections.push("kb.general");
      }
    }

    // ── kb.features ─────────────────────────────────────────────────────────
    if (args.features !== undefined) {
      const defaults = getDefaults("kb.features");

      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "kb.features"))
        .unique();

      const oldValues: Record<string, unknown> = existingDoc
        ? { ...defaults, ...(existingDoc.values as Record<string, unknown>) }
        : { ...defaults };

      const newValues: Record<string, unknown> = {
        ...oldValues,
        ...Object.fromEntries(
          Object.entries(args.features).filter(([, v]) => v !== undefined),
        ),
      };

      const changes = computeChanges(oldValues, newValues);

      if (changes.length > 0) {
        if (existingDoc) {
          await ctx.db.patch(existingDoc._id, {
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        } else {
          await ctx.db.insert("settings", {
            section: "kb.features",
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        }
        updatedSections.push("kb.features");
      }
    }

    // ── kb.search ────────────────────────────────────────────────────────────
    if (args.search !== undefined) {
      const defaults = getDefaults("kb.search");

      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "kb.search"))
        .unique();

      const oldValues: Record<string, unknown> = existingDoc
        ? { ...defaults, ...(existingDoc.values as Record<string, unknown>) }
        : { ...defaults };

      const newValues: Record<string, unknown> = {
        ...oldValues,
        ...Object.fromEntries(
          Object.entries(args.search).filter(([, v]) => v !== undefined),
        ),
      };

      const changes = computeChanges(oldValues, newValues);

      if (changes.length > 0) {
        if (existingDoc) {
          await ctx.db.patch(existingDoc._id, {
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        } else {
          await ctx.db.insert("settings", {
            section: "kb.search",
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        }
        updatedSections.push("kb.search");
      }
    }

    // Emit event if anything changed
    if (updatedSections.length > 0) {
      await emitEvent(ctx, "settings.updated", SYSTEM.SETTINGS, {
        sections: updatedSections,
        updatedBy: user._id,
        timestamp: now,
      });
    }

    return { updatedSections };
  },
});
