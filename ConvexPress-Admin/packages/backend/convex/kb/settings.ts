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
import { SYSTEM, SETTINGS_EVENTS } from "../events/constants";
import {
  getDefaults,
  KB_GENERAL_DEFAULTS,
  KB_FEATURES_DEFAULTS,
  KB_SEARCH_DEFAULTS,
} from "../settings/defaults";
import { computeChanges } from "../settings/helpers";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { SECRET_SENTINEL } from "../helpers/settingsSecret";

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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getKbSettings = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await currentUserCan(ctx, "manage_options");
    if (!user) return null;

    // Load all three KB sections, merging stored values with defaults
    const sections = ["kb.general", "kb.features", "kb.search"] as const;
    const result: Record<string, Record<string, unknown>> = {};

    for (const section of sections) {
      const defaults = getDefaults(section);
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", section))
        .unique();

      result[section] = doc
        ? { ...defaults, ...(doc.values as Record<string, unknown>) }
        : { ...defaults };
    }

    const search = result["kb.search"] as Record<string, unknown>;

    // Mask API keys before returning to the client. updateKbSettings treats
    // this sentinel as "keep the existing stored secret."
    if (search.meilisearchApiKey && typeof search.meilisearchApiKey === "string") {
      search.meilisearchApiKey = SECRET_SENTINEL;
    }
    if (search.ragApiKey && typeof search.ragApiKey === "string") {
      search.ragApiKey = SECRET_SENTINEL;
    }

    return {
      general: result["kb.general"] as unknown as typeof KB_GENERAL_DEFAULTS,
      features: result["kb.features"] as unknown as typeof KB_FEATURES_DEFAULTS,
      search: search as unknown as typeof KB_SEARCH_DEFAULTS,
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateKbSettings = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    general: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        siteName: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        siteDescription: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        homepageLayout: v.optional(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          v.union(
            // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
            v.literal("categories"),
            // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
            v.literal("search"),
            // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
            v.literal("featured"),
          ),
        ),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        articlesPerPage: v.optional(v.number()),
      }),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    features: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        commentsEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        bookmarksEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        progressTrackingEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        ratingsEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        relatedArticlesEnabled: v.optional(v.boolean()),
      }),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    search: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        meilisearchEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        meilisearchUrl: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        meilisearchApiKey: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        ragEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        ragProvider: v.optional(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          v.union(v.literal("openai"), v.literal("anthropic")),
        ),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        ragApiKey: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        ragModel: v.optional(v.string()),
      }),
    ),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "manage_options");
    const now = Date.now();
    const updatedSections: string[] = [];

    // ── kb.general ──────────────────────────────────────────────────────────
    if (args.general !== undefined) {
      const defaults = getDefaults("kb.general");

      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "kb.general"))
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
          await ctx.db.patch("settings", existingDoc._id, {
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
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "kb.features"))
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
          await ctx.db.patch("settings", existingDoc._id, {
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
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "kb.search"))
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
      for (const key of ["meilisearchApiKey", "ragApiKey"]) {
        if (newValues[key] === SECRET_SENTINEL) {
          newValues[key] = oldValues[key] ?? "";
        }
      }

      const changes = computeChanges(oldValues, newValues);

      if (changes.length > 0) {
        if (existingDoc) {
          await ctx.db.patch("settings", existingDoc._id, {
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
      await emitEvent(ctx, SETTINGS_EVENTS.UPDATED, SYSTEM.SETTINGS, {
        sections: updatedSections,
        updatedBy: user._id,
        timestamp: now,
      });
    }

    return { updatedSections };
  },
});
