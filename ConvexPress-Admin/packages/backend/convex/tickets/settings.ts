/**
 * Ticket System - Settings Functions
 *
 * Ticket-specific settings stored in the global settings table using the
 * section-based approach. Two sections:
 *
 *   ticket.general - Categories, default priority, auto-close config
 *   ticket.sla     - SLA targets for first response and resolution
 *
 * Uses the Settings System's section-based infrastructure (same pattern as
 * the KB system and core settings sections).
 *
 * Default values:
 *   ticket.general:
 *     categories          - 6 default categories (billing, technical, account, ...)
 *     defaultPriority     - "medium"
 *     autoCloseAfterDays  - 14 (0 = disabled)
 *   ticket.sla:
 *     firstResponseTarget - 240 minutes (4 hours)
 *     resolutionTarget    - 2880 minutes (48 hours)
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SYSTEM, SETTINGS_EVENTS } from "../events/constants";
import {
  getDefaults,
  TICKET_GENERAL_DEFAULTS,
  TICKET_SLA_DEFAULTS,
} from "../settings/defaults";
import { computeChanges } from "../settings/helpers";

// ─── getTicketSettings ───────────────────────────────────────────────────────

/**
 * Get all ticket settings, merged with defaults.
 *
 * Returns an object with two sections:
 *   - general: { categories, defaultPriority, autoCloseAfterDays }
 *   - sla: { firstResponseTarget, resolutionTarget }
 *
 * @auth ticket.viewAll capability required
 */
export const getTicketSettings = query({
  args: {},
  handler: async (ctx) => {
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;

    // Load both ticket sections, merging stored values with defaults
    const sections = ["ticket.general", "ticket.sla"] as const;
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

    return {
      general: result["ticket.general"] as typeof TICKET_GENERAL_DEFAULTS,
      sla: result["ticket.sla"] as typeof TICKET_SLA_DEFAULTS,
    };
  },
});

// ─── updateTicketSettings ────────────────────────────────────────────────────

/**
 * Update ticket settings. Administrator only.
 *
 * Both sections can be updated in a single call by passing the corresponding
 * argument. Omitted sections are left unchanged.
 *
 * @auth manage_options (Administrator only)
 */
export const updateTicketSettings = mutation({
  args: {
    general: v.optional(
      v.object({
        categories: v.optional(
          v.array(v.object({ value: v.string(), label: v.string() })),
        ),
        defaultPriority: v.optional(
          v.union(
            v.literal("low"),
            v.literal("medium"),
            v.literal("high"),
            v.literal("urgent"),
          ),
        ),
        autoCloseAfterDays: v.optional(v.number()),
      }),
    ),
    sla: v.optional(
      v.object({
        firstResponseTarget: v.optional(v.number()),
        resolutionTarget: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    const now = Date.now();
    const updatedSections: string[] = [];

    // ── ticket.general ──────────────────────────────────────────────────────
    if (args.general !== undefined) {
      const defaults = getDefaults("ticket.general");

      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "ticket.general"))
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
            section: "ticket.general",
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        }
        updatedSections.push("ticket.general");
      }
    }

    // ── ticket.sla ──────────────────────────────────────────────────────────
    if (args.sla !== undefined) {
      const defaults = getDefaults("ticket.sla");

      const existingDoc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "ticket.sla"))
        .unique();

      const oldValues: Record<string, unknown> = existingDoc
        ? { ...defaults, ...(existingDoc.values as Record<string, unknown>) }
        : { ...defaults };

      const newValues: Record<string, unknown> = {
        ...oldValues,
        ...Object.fromEntries(
          Object.entries(args.sla).filter(([, v]) => v !== undefined),
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
            section: "ticket.sla",
            values: newValues,
            updatedAt: now,
            updatedBy: user._id,
          });
        }
        updatedSections.push("ticket.sla");
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
