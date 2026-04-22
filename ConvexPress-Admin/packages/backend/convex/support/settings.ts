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
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { SECRET_SENTINEL } from "../helpers/settingsSecret";

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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getSupportSettings = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canView = await currentUserCan(ctx, "manage_options");
    if (!canView) return null;

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const [widgetDoc, aiDoc] = await Promise.all([
      ctx.db
        .query("settings")
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "support.widget"))
        .unique(),
      ctx.db
        .query("settings")
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "support.ai"))
        .unique(),
    ]);

    const ai = {
      ...SUPPORT_AI_DEFAULTS,
      ...(aiDoc ? (aiDoc.values as Record<string, unknown>) : {}),
    } as Record<string, unknown>;

    // Mask API keys before returning to the client. updateSupportSettings treats
    // this sentinel as "keep the existing stored secret."
    if (ai.aiApiKey && typeof ai.aiApiKey === "string") {
      ai.aiApiKey = SECRET_SENTINEL;
    }
    if (ai.meilisearchApiKey && typeof ai.meilisearchApiKey === "string") {
      ai.meilisearchApiKey = SECRET_SENTINEL;
    }

    return {
      widget: {
        ...SUPPORT_WIDGET_DEFAULTS,
        ...(widgetDoc ? (widgetDoc.values as Record<string, unknown>) : {}),
      } as unknown as typeof SUPPORT_WIDGET_DEFAULTS,
      ai: ai as unknown as typeof SUPPORT_AI_DEFAULTS,
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateSupportSettings = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    widget: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        enabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        widgetTitle: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        widgetSubtitle: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        widgetColor: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        showKbSearch: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        showTicketHistory: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        aiEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        escalationButtonLabel: v.optional(v.string()),
      }),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    ai: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        aiProvider: v.optional(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          v.union(v.literal("openai"), v.literal("anthropic"), v.null()),
        ),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        aiApiKey: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        aiModel: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        meilisearchEnabled: v.optional(v.boolean()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        meilisearchUrl: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        meilisearchApiKey: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        ragEnabled: v.optional(v.boolean()),
      }),
    ),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const user = await requireCan(ctx, "manage_options");
    const now = Date.now();
    const updatedSections: string[] = [];

    // ── support.widget ────────────────────────────────────────────────────────
    if (args.widget !== undefined) {
      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "support.widget"))
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
        .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "support.ai"))
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
      for (const key of ["aiApiKey", "meilisearchApiKey"]) {
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
