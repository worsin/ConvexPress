/**
 * Support Bridge System - Settings Functions
 *
 * Support-specific settings stored in the global settings table using the
 * section-based approach. Two sections:
 *
 *   support.widget - Widget appearance, visibility, feature toggles
 *   support.ai     - AI provider, API key, model, Meilisearch and RAG config
 *
 * Defaults:
 *   support.widget:
 *     enabled              - true
 *     widgetTitle          - "Support"
 *     widgetSubtitle       - "How can we help you today?"
 *     widgetColor          - "#3b82f6"
 *     showKbSearch         - true
 *     showTicketHistory    - true
 *     aiEnabled            - false
 *     escalationButtonLabel - "Contact Support"
 *   support.ai:
 *     aiProvider           - null (not configured)
 *     aiApiKey             - ""
 *     aiModel              - ""
 *     meilisearchEnabled   - false
 *     meilisearchUrl       - ""
 *     meilisearchApiKey    - ""
 *     ragEnabled           - false
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SYSTEM, SETTINGS_EVENTS } from "../events/constants";
import { computeChanges } from "../settings/helpers";

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const SUPPORT_WIDGET_DEFAULTS = {
  enabled: true,
  widgetTitle: "Support",
  widgetSubtitle: "How can we help you today?",
  widgetColor: "#3b82f6",
  showKbSearch: true,
  showTicketHistory: true,
  aiEnabled: false,
  escalationButtonLabel: "Contact Support",
} as const;

export const SUPPORT_AI_DEFAULTS: {
  readonly aiProvider: "openai" | "anthropic" | null;
  readonly aiApiKey: string;
  readonly aiModel: string;
  readonly meilisearchEnabled: boolean;
  readonly meilisearchUrl: string;
  readonly meilisearchApiKey: string;
  readonly ragEnabled: boolean;
} = {
  aiProvider: null,
  aiApiKey: "",
  aiModel: "",
  meilisearchEnabled: false,
  meilisearchUrl: "",
  meilisearchApiKey: "",
  ragEnabled: false,
};

// ─── getSupportSettings ───────────────────────────────────────────────────────

/**
 * Get all support settings, merged with defaults.
 *
 * Returns an object with two sections:
 *   - widget: { enabled, widgetTitle, widgetSubtitle, widgetColor, ... }
 *   - ai: { aiProvider, aiApiKey, aiModel, meilisearchEnabled, ... }
 *
 * @auth manage_options (Administrator only)
 */
export const getSupportSettings = query({
  args: {},
  handler: async (ctx) => {
    const canView = await currentUserCan(ctx, "manage_options");
    if (!canView) return null;

    const [widgetDoc, aiDoc] = await Promise.all([
      ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "support.widget"))
        .unique(),
      ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "support.ai"))
        .unique(),
    ]);

    const ai = {
      ...SUPPORT_AI_DEFAULTS,
      ...(aiDoc ? (aiDoc.values as Record<string, unknown>) : {}),
    } as Record<string, unknown>;

    // Mask API keys before returning to the client
    if (ai.aiApiKey && typeof ai.aiApiKey === "string") {
      const key = ai.aiApiKey;
      ai.aiApiKey = key.length > 8
        ? key.slice(0, 4) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-4)
        : "••••••••";
    }
    if (ai.meilisearchApiKey && typeof ai.meilisearchApiKey === "string") {
      const key = ai.meilisearchApiKey;
      ai.meilisearchApiKey = key.length > 8
        ? key.slice(0, 4) + "•".repeat(Math.min(key.length - 8, 20)) + key.slice(-4)
        : "••••••••";
    }

    return {
      widget: {
        ...SUPPORT_WIDGET_DEFAULTS,
        ...(widgetDoc ? (widgetDoc.values as Record<string, unknown>) : {}),
      } as typeof SUPPORT_WIDGET_DEFAULTS,
      ai: ai as typeof SUPPORT_AI_DEFAULTS,
    };
  },
});

// ─── updateSupportSettings ────────────────────────────────────────────────────

/**
 * Update support settings. Administrator only.
 *
 * Both sections can be updated in a single call. Omitted sections are left
 * unchanged.
 *
 * @auth manage_options (Administrator only)
 */
export const updateSupportSettings = mutation({
  args: {
    widget: v.optional(
      v.object({
        enabled: v.optional(v.boolean()),
        widgetTitle: v.optional(v.string()),
        widgetSubtitle: v.optional(v.string()),
        widgetColor: v.optional(v.string()),
        showKbSearch: v.optional(v.boolean()),
        showTicketHistory: v.optional(v.boolean()),
        aiEnabled: v.optional(v.boolean()),
        escalationButtonLabel: v.optional(v.string()),
      }),
    ),
    ai: v.optional(
      v.object({
        aiProvider: v.optional(
          v.union(v.literal("openai"), v.literal("anthropic"), v.null()),
        ),
        aiApiKey: v.optional(v.string()),
        aiModel: v.optional(v.string()),
        meilisearchEnabled: v.optional(v.boolean()),
        meilisearchUrl: v.optional(v.string()),
        meilisearchApiKey: v.optional(v.string()),
        ragEnabled: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    const now = Date.now();
    const updatedSections: string[] = [];

    // ── support.widget ────────────────────────────────────────────────────────
    if (args.widget !== undefined) {
      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "support.widget"))
        .unique();

      const oldValues: Record<string, unknown> = existingDoc
        ? { ...SUPPORT_WIDGET_DEFAULTS, ...(existingDoc.values as Record<string, unknown>) }
        : { ...SUPPORT_WIDGET_DEFAULTS };

      const newValues: Record<string, unknown> = {
        ...oldValues,
        ...Object.fromEntries(
          Object.entries(args.widget).filter(([, val]) => val !== undefined),
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
            section: "support.widget",
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        }
        updatedSections.push("support.widget");
      }
    }

    // ── support.ai ────────────────────────────────────────────────────────────
    if (args.ai !== undefined) {
      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "support.ai"))
        .unique();

      const oldValues: Record<string, unknown> = existingDoc
        ? { ...SUPPORT_AI_DEFAULTS, ...(existingDoc.values as Record<string, unknown>) }
        : { ...SUPPORT_AI_DEFAULTS };

      const newValues: Record<string, unknown> = {
        ...oldValues,
        ...Object.fromEntries(
          Object.entries(args.ai).filter(([, val]) => val !== undefined),
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
            section: "support.ai",
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        }
        updatedSections.push("support.ai");
      }
    }

    // Emit settings event if anything changed
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
