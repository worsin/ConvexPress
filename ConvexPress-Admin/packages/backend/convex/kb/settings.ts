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

import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";
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
  type KbFeaturesSettings,
  type KbGeneralSettings,
  type KbSearchSettings,
} from "../settings/defaults";
import {
  choiceSetting,
  flagSetting,
  numberSetting,
  readSettingsGroup,
  textSetting,
  type SettingsSpec,
} from "../helpers/settingsReader";
import { computeChanges } from "../settings/helpers";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { SECRET_SENTINEL, encryptSettingSecret } from "../helpers/settingsSecret";

// ─── getKbSettings ───────────────────────────────────────────────────────────

const KB_GENERAL_SPEC: SettingsSpec<KbGeneralSettings> = {
  siteName: textSetting,
  siteDescription: textSetting,
  homepageLayout: choiceSetting(["categories", "search", "featured"]),
  articlesPerPage: numberSetting,
};

const KB_FEATURES_SPEC: SettingsSpec<KbFeaturesSettings> = {
  commentsEnabled: flagSetting,
  bookmarksEnabled: flagSetting,
  progressTrackingEnabled: flagSetting,
  ratingsEnabled: flagSetting,
  relatedArticlesEnabled: flagSetting,
};

const KB_SEARCH_SPEC: SettingsSpec<KbSearchSettings> = {
  meilisearchEnabled: flagSetting,
  meilisearchUrl: textSetting,
  meilisearchApiKey: textSetting,
  ragEnabled: flagSetting,
  ragProvider: choiceSetting(["openai", "anthropic"]),
  ragApiKey: textSetting,
  ragModel: textSetting,
};

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
  returns: v.union(v.null(), v.object({
    general: v.object({
      siteName: v.string(),
      siteDescription: v.string(),
      homepageLayout: v.union(v.literal("search"), v.literal("categories"), v.literal("featured")),
      articlesPerPage: v.number(),
    }),
    features: v.object({
      commentsEnabled: v.boolean(),
      bookmarksEnabled: v.boolean(),
      progressTrackingEnabled: v.boolean(),
      ratingsEnabled: v.boolean(),
      relatedArticlesEnabled: v.boolean(),
    }),
    search: v.object({
      meilisearchEnabled: v.boolean(),
      meilisearchUrl: v.string(),
      meilisearchApiKey: v.string(),
      ragEnabled: v.boolean(),
      ragProvider: v.union(v.literal("anthropic"), v.literal("openai")),
      ragApiKey: v.string(),
      ragModel: v.string(),
    }),
  })),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await currentUserCan(ctx, "manage_options");
    if (!user) return null;

    // Load all three KB sections, each read field by field over its defaults
    const read = async (section: "kb.general" | "kb.features" | "kb.search") =>
      (await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", section))
        .unique())?.values;

    const general = readSettingsGroup(KB_GENERAL_SPEC, KB_GENERAL_DEFAULTS, await read("kb.general"));
    const features = readSettingsGroup(KB_FEATURES_SPEC, KB_FEATURES_DEFAULTS, await read("kb.features"));
    const search = readSettingsGroup(KB_SEARCH_SPEC, KB_SEARCH_DEFAULTS, await read("kb.search"));

    // Mask API keys before returning to the client. updateKbSettings treats
    // this sentinel as "keep the existing stored secret."
    if (search.meilisearchApiKey) search.meilisearchApiKey = SECRET_SENTINEL;
    if (search.ragApiKey) search.ragApiKey = SECRET_SENTINEL;

    return { general, features, search };
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
  returns: v.object({ updatedSections: v.array(v.string()) }),
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
          await patchWithMediaReferences<"settings">(ctx, "settings", existingDoc._id, {
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        } else {
          await insertWithMediaReferences<"settings">(ctx, "settings", {
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
          await patchWithMediaReferences<"settings">(ctx, "settings", existingDoc._id, {
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        } else {
          await insertWithMediaReferences<"settings">(ctx, "settings", {
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
      if (args.search.ragProvider !== undefined && args.search.ragProvider !== oldValues.ragProvider &&
          (args.search.ragApiKey === undefined || args.search.ragApiKey === SECRET_SENTINEL)) newValues.ragApiKey = "";
      for (const key of ["meilisearchApiKey", "ragApiKey"]) {
        if (newValues[key] === SECRET_SENTINEL) {
          newValues[key] = oldValues[key] ?? "";
        } else if (Object.prototype.hasOwnProperty.call(args.search, key) && typeof newValues[key] === "string" && newValues[key]) {
          newValues[key] = await encryptSettingSecret(newValues[key] as string);
        }
      }

      const changes = computeChanges(oldValues, newValues);

      if (changes.length > 0) {
        if (existingDoc) {
          await patchWithMediaReferences<"settings">(ctx, "settings", existingDoc._id, {
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        } else {
          await insertWithMediaReferences<"settings">(ctx, "settings", {
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
