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

import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v, type ObjectType } from "convex/values";
import { requireCan, currentUserCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { SYSTEM, SETTINGS_EVENTS } from "../events/constants";
import {
  getDefaults,
  TICKET_GENERAL_DEFAULTS,
  TICKET_SLA_DEFAULTS,
  type TicketGeneralSettings,
  type TicketSlaSettings,
} from "../settings/defaults";
import { computeChanges } from "../settings/helpers";
import {
  choiceSetting,
  listSetting,
  numberSetting,
  readSettingsGroup,
  settingsRecord,
  type SettingsSpec,
} from "../helpers/settingsReader";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { assertSupportDeskHere } from "../managedRecords/helpers";
import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";

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
function ticketCategory(value: unknown): TicketGeneralSettings["categories"][number] | null {
  const entry = settingsRecord(value);
  return typeof entry.value === "string" && typeof entry.label === "string"
    ? { value: entry.value, label: entry.label }
    : null;
}

const TICKET_GENERAL_SPEC: SettingsSpec<TicketGeneralSettings> = {
  categories: listSetting(ticketCategory),
  defaultPriority: choiceSetting(["low", "medium", "high", "urgent"]),
  autoCloseAfterDays: numberSetting,
};

const TICKET_SLA_SPEC: SettingsSpec<TicketSlaSettings> = {
  firstResponseTarget: numberSetting,
  resolutionTarget: numberSetting,
};

/** The ticket settings, read field by field over their defaults. */
export async function readTicketSettings(ctx: Pick<QueryCtx, "db">): Promise<{ general: TicketGeneralSettings; sla: TicketSlaSettings }> {
  const read = async (section: "ticket.general" | "ticket.sla") =>
    (await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", section))
      .unique())?.values;
  return {
    general: readSettingsGroup(TICKET_GENERAL_SPEC, TICKET_GENERAL_DEFAULTS, await read("ticket.general")),
    sla: readSettingsGroup(TICKET_SLA_SPEC, TICKET_SLA_DEFAULTS, await read("ticket.sla")),
  };
}

export const ticketSettingsValidator = v.object({
  general: v.object({
    categories: v.array(v.object({ value: v.string(), label: v.string() })),
    defaultPriority: v.union(v.literal("high"), v.literal("medium"), v.literal("low"), v.literal("urgent")),
    autoCloseAfterDays: v.number(),
  }),
  sla: v.object({ firstResponseTarget: v.number(), resolutionTarget: v.number() }),
});

export const getTicketSettings = query({
  args: {},
  returns: v.union(v.null(), ticketSettingsValidator),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const canView = await currentUserCan(ctx, "ticket.viewAll");
    if (!canView) return null;
    return await readTicketSettings(ctx);
  },
});

/** What an update may change: either section, any of its fields. */
export const ticketSettingsArgs = {
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
};

type TicketSettingsUpdate = ObjectType<typeof ticketSettingsArgs>;

/**
 * Write ticket settings changes and announce them. `by` is who changed them:
 * a ConvexPress user, or an operator application's agent (tickets/operator.ts).
 * Returns the sections that changed.
 */
export async function writeTicketSettings(
  ctx: MutationCtx,
  update: TicketSettingsUpdate,
  by: { userId: Id<"users"> } | { ref: string },
): Promise<string[]> {
  const now = Date.now();
  const updatedBy = "userId" in by ? { updatedBy: by.userId } : { updatedByRef: by.ref };
  const updatedSections: string[] = [];
  for (const [section, values] of [["ticket.general", update.general], ["ticket.sla", update.sla]] as const) {
    if (values === undefined) continue;
    const defaults = getDefaults(section);
    const existingDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", section))
      .unique();
    const oldValues: Record<string, unknown> = existingDoc
      ? { ...defaults, ...(existingDoc.values as Record<string, unknown>) }
      : { ...defaults };
    const newValues: Record<string, unknown> = {
      ...oldValues,
      ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
    };
    if (computeChanges(oldValues, newValues).length === 0) continue;
    if (existingDoc) {
      // Whoever changed it last replaces the previous kind of author.
      await patchWithMediaReferences<"settings">(ctx, "settings", existingDoc._id, {
        values: newValues,
        updatedAt: now,
        updatedBy: undefined,
        updatedByRef: undefined,
        ...updatedBy,
      });
    } else {
      await insertWithMediaReferences<"settings">(ctx, "settings", { section, values: newValues, updatedAt: now, ...updatedBy });
    }
    updatedSections.push(section);
  }
  if (updatedSections.length > 0) {
    await emitEvent(ctx, SETTINGS_EVENTS.UPDATED, SYSTEM.SETTINGS, {
      sections: updatedSections,
      updatedBy: "userId" in by ? by.userId : null,
      ...("ref" in by ? { updatedByRef: by.ref } : {}),
      timestamp: now,
    });
  }
  return updatedSections;
}

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
  args: ticketSettingsArgs,
  returns: v.object({ updatedSections: v.array(v.string()) }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    const user = await requireCan(ctx, "manage_options");
    await assertSupportDeskHere(ctx);
    return { updatedSections: await writeTicketSettings(ctx, args, { userId: user._id }) };
  },
});
